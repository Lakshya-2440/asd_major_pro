import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { randomUUID } from 'node:crypto';
import { pool } from '../config/database';

export class AnimalNotFoundError extends Error {}
export class DatabaseUnavailableError extends Error {}

type Connectable = Pick<Pool, 'connect'>;

export interface CreateDraftInput {
  animalId: string;
  evaluatorId: string;
  viewType: 'side' | 'rear' | 'front';
  filePath: string;
}

export async function createDraftEvaluation(db: Connectable, input: CreateDraftInput) {
  const client: PoolClient = await db.connect();
  const evaluationId = randomUUID();
  const imageId = randomUUID();
  try {
    await client.query('BEGIN');
    const animal = await client.query('SELECT id FROM animals WHERE id = $1::uuid', [input.animalId]);
    if (animal.rowCount === 0) throw new AnimalNotFoundError('Animal not found');

    const evaluation = await client.query<QueryResultRow>(
      `INSERT INTO evaluations (id, animal_id, evaluator_id, status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'pending_analysis'::"EvaluationStatus")
       RETURNING id, status`,
      [evaluationId, input.animalId, input.evaluatorId],
    );
    const image = await client.query<QueryResultRow>(
      `INSERT INTO images (id, evaluation_id, view_type, file_path, quality_flags)
       VALUES ($1::uuid, $2::uuid, $3::"ViewType", $4, '[]'::jsonb)
       RETURNING id`,
      [imageId, evaluationId, input.viewType, input.filePath],
    );
    await client.query('COMMIT');
    return { evaluationId: evaluation.rows[0].id as string, status: evaluation.rows[0].status as string, imageId: image.rows[0].id as string };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function findEvaluationImage(
  db: Pick<Pool, 'query'>,
  args: { evaluationId: string; imageId: string; userId: string; role: string },
): Promise<QueryResultRow | undefined> {
  const result = await db.query<QueryResultRow>(
    `SELECT i.file_path
     FROM images i
     JOIN evaluations e ON e.id = i.evaluation_id
     WHERE e.id = $1::uuid AND i.id = $2::uuid
       AND ($3 <> 'typer' OR e.evaluator_id = $4::uuid)
     LIMIT 1`,
    [args.evaluationId, args.imageId, args.role, args.userId],
  );
  return result.rows[0];
}

export function getEvaluationDatabase(): Connectable {
  if (!pool) throw new DatabaseUnavailableError('Database is unavailable');
  return pool;
}
