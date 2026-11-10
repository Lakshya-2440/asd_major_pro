import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';
import { pool } from '../config/database';
import type { EvaluationAccessScope } from './evaluations.service';

type Connectable = Pick<Pool, 'connect'>;

export class ConfirmedEvaluationRequiredError extends Error {}

export async function getEvaluationForBpaSync(
  db: Pick<Pool, 'query'>,
  args: EvaluationAccessScope & { evaluationId: string },
): Promise<QueryResultRow | undefined> {
  const result = await db.query<QueryResultRow>(
    `SELECT e.id, e.status, e.overall_score, e.pipeline_version, e.created_at,
            jsonb_build_object('id', a.id, 'tag_id', a.tag_id) AS animal,
            jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email) AS evaluator,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('trait_name', t.trait_name,
                   'ai_score', t.ai_score, 'final_score', t.final_score))
                   FROM trait_scores t WHERE t.evaluation_id = e.id), '[]'::jsonb) AS trait_scores
     FROM evaluations e
     JOIN animals a ON a.id = e.animal_id
     JOIN users u ON u.id = e.evaluator_id
     WHERE e.id = $1::uuid
       AND ($2 <> 'typer' OR e.evaluator_id = $3::uuid OR a.village IN (
         SELECT DISTINCT own_animal.village
         FROM evaluations own_evaluation
         JOIN animals own_animal ON own_animal.id = own_evaluation.animal_id
         WHERE own_evaluation.evaluator_id = $3::uuid AND own_animal.village IS NOT NULL
       ))
     LIMIT 1`,
    [args.evaluationId, args.role, args.userId],
  );
  return result.rows[0];
}

export async function createBpaSyncAttempt(db: Connectable, evaluationId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const evaluation = await client.query<{ status: string }>(
      `SELECT status FROM evaluations WHERE id = $1::uuid FOR UPDATE`,
      [evaluationId],
    );
    if (evaluation.rowCount === 0 || evaluation.rows[0].status !== 'confirmed') {
      throw new ConfirmedEvaluationRequiredError('Evaluation must be confirmed before BPA synchronization');
    }
    const attemptResult = await client.query<{ next_attempt: number }>(
      `SELECT COALESCE(MAX(attempts), 0)::int + 1 AS next_attempt
       FROM bpa_sync WHERE evaluation_id = $1::uuid`,
      [evaluationId],
    );
    const attempt = Number(attemptResult.rows[0].next_attempt);
    const syncResult = await client.query<QueryResultRow>(
      `INSERT INTO bpa_sync (id, evaluation_id, status, attempts)
       VALUES ($1::uuid, $2::uuid, 'pending'::"BpaSyncStatus", $3)
       RETURNING id, evaluation_id, status, attempts, last_error, bpa_reference_id, synced_at, created_at`,
      [randomUUID(), evaluationId, attempt],
    );
    await client.query('COMMIT');
    return syncResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function completeBpaSyncAttempt(
  db: Connectable,
  input: { syncId: string; status: 'synced' | 'failed'; bpaReferenceId?: string; lastError?: string },
) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<QueryResultRow>(
      `UPDATE bpa_sync
       SET status = $1::"BpaSyncStatus", bpa_reference_id = $2, last_error = $3,
           synced_at = CASE WHEN $1 = 'synced' THEN NOW() ELSE NULL END
       WHERE id = $4::uuid
       RETURNING id, evaluation_id, status, attempts, last_error, bpa_reference_id, synced_at, created_at`,
      [input.status, input.bpaReferenceId ?? null, input.lastError ?? null, input.syncId],
    );
    const sync = result.rows[0];
    if (input.status === 'synced' && sync) {
      await client.query(
        `UPDATE evaluations SET status = 'synced'::"EvaluationStatus", updated_at = NOW()
         WHERE id = $1::uuid AND status = 'confirmed'::"EvaluationStatus"`,
        [sync.evaluation_id],
      );
    }
    await client.query('COMMIT');
    return sync;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function getBpaDatabase(): Connectable & Pick<Pool, 'query'> {
  if (!pool) throw new Error('Database is unavailable');
  return pool;
}

