import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { randomUUID } from 'node:crypto';
import { pool } from '../config/database';
import type { AnalysisResponse, RecomputeResponse } from './analysis.service';

export class AnimalNotFoundError extends Error {}
export class DatabaseUnavailableError extends Error {}
export class TraitScoreNotFoundError extends Error {}
export class LandmarkNotFoundError extends Error {}

export const evaluationStatuses = ['draft', 'pending_analysis', 'analyzed', 'failed_quality', 'confirmed', 'synced'] as const;

export interface EvaluationListFilters {
  page: number;
  limit: number;
  species?: 'cattle' | 'buffalo';
  breed?: string;
  status?: typeof evaluationStatuses[number];
  village?: string;
  evaluator_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface EvaluationAccessScope {
  userId: string;
  role: string;
}

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
     JOIN animals a ON a.id = e.animal_id
     WHERE e.id = $1::uuid AND i.id = $2::uuid
       AND ($3 <> 'typer' OR e.evaluator_id = $4::uuid OR a.village IN (
         SELECT DISTINCT own_animal.village
         FROM evaluations own_evaluation
         JOIN animals own_animal ON own_animal.id = own_evaluation.animal_id
         WHERE own_evaluation.evaluator_id = $4::uuid AND own_animal.village IS NOT NULL
       ))
     LIMIT 1`,
    [args.evaluationId, args.imageId, args.role, args.userId],
  );
  return result.rows[0];
}

export async function listEvaluations(
  db: Pick<Pool, 'query'>,
  filters: EvaluationListFilters,
  access: EvaluationAccessScope,
) {
  const values: unknown[] = [access.role, access.userId];
  const clauses = [
    `($1 <> 'typer' OR e.evaluator_id = $2::uuid OR a.village IN (
       SELECT DISTINCT own_animal.village
       FROM evaluations own_evaluation
       JOIN animals own_animal ON own_animal.id = own_evaluation.animal_id
       WHERE own_evaluation.evaluator_id = $2::uuid AND own_animal.village IS NOT NULL
     ))`,
  ];
  const addFilter = (sql: (placeholder: string) => string, value: unknown) => {
    values.push(value);
    clauses.push(sql(`$${values.length}`));
  };
  if (filters.species) addFilter((p) => `a.species = ${p}::"Species"`, filters.species);
  if (filters.breed) addFilter((p) => `a.breed ILIKE ${p}`, `%${filters.breed}%`);
  if (filters.status) addFilter((p) => `e.status = ${p}::"EvaluationStatus"`, filters.status);
  if (filters.village) addFilter((p) => `a.village ILIKE ${p}`, `%${filters.village}%`);
  if (filters.evaluator_id) addFilter((p) => `e.evaluator_id = ${p}::uuid`, filters.evaluator_id);
  if (filters.from_date) addFilter((p) => `e.created_at >= ${p}::date`, filters.from_date);
  if (filters.to_date) addFilter((p) => `e.created_at < (${p}::date + INTERVAL '1 day')`, filters.to_date);
  const where = clauses.join(' AND ');

  const countResult = await db.query<{ total: number | string }>(
    `SELECT COUNT(*)::int AS total
     FROM evaluations e
     JOIN animals a ON a.id = e.animal_id
     WHERE ${where}`,
    values,
  );
  const total = Number(countResult.rows[0]?.total ?? 0);
  const pageValues = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const result = await db.query(
    `SELECT e.id, e.animal_id, e.evaluator_id, e.status, e.overall_score, e.pipeline_version,
            e.created_at, e.updated_at,
            jsonb_build_object('id', a.id, 'tag_id', a.tag_id, 'species', a.species, 'breed', a.breed,
                               'owner_name', a.owner_name, 'village', a.village) AS animal,
            jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', u.role) AS evaluator
     FROM evaluations e
     JOIN animals a ON a.id = e.animal_id
     JOIN users u ON u.id = e.evaluator_id
     WHERE ${where}
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    pageValues,
  );
  return {
    data: result.rows,
    pagination: {
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
}

export async function getEvaluationDetail(
  db: Pick<Pool, 'query'>,
  args: EvaluationAccessScope & { evaluationId: string },
): Promise<QueryResultRow | undefined> {
  const result = await db.query<QueryResultRow>(
    `SELECT e.id, e.animal_id, e.evaluator_id, e.status, e.overall_score, e.pipeline_version, e.pixels_per_cm,
            e.created_at, e.updated_at,
            jsonb_build_object('id', a.id, 'tag_id', a.tag_id, 'species', a.species, 'breed', a.breed,
                               'owner_name', a.owner_name, 'village', a.village) AS animal,
            jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', u.role) AS evaluator,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'view_type', i.view_type,
                   'image_url', '/api/evaluations/' || e.id::text || '/images/' || i.id::text,
                   'quality_flags', i.quality_flags)) FROM images i WHERE i.evaluation_id = e.id), '[]'::jsonb) AS images,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name,
                   'estimated_pos', l.estimated_pos, 'corrected_pos', l.corrected_pos, 'confidence', l.confidence))
                   FROM landmarks l WHERE l.evaluation_id = e.id), '[]'::jsonb) AS landmarks,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'value', m.value,
                   'unit', m.unit, 'confidence', m.confidence)) FROM measurements m WHERE m.evaluation_id = e.id), '[]'::jsonb) AS measurements,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'trait_name', t.trait_name,
                   'ai_score', t.ai_score, 'final_score', t.final_score, 'override_reason', t.override_reason))
                   FROM trait_scores t WHERE t.evaluation_id = e.id), '[]'::jsonb) AS trait_scores,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'status', b.status, 'attempts', b.attempts,
                   'last_error', b.last_error, 'synced_at', b.synced_at)
                   ORDER BY b.created_at DESC) FROM bpa_sync b WHERE b.evaluation_id = e.id), '[]'::jsonb) AS bpa_sync,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', audit.id, 'trait_name', audit.trait_name,
                   'previous_score', audit.previous_score, 'final_score', audit.final_score,
                   'override_reason', audit.override_reason, 'changed_by', audit.changed_by,
                   'changed_by_name', audit_user.name, 'changed_at', audit.changed_at)
                   ORDER BY audit.changed_at DESC)
                   FROM score_override_audit audit JOIN users audit_user ON audit_user.id = audit.changed_by
                   WHERE audit.evaluation_id = e.id), '[]'::jsonb) AS score_override_audit
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

export async function getEvaluationForAnalysis(
  db: Pick<Pool, 'query'>,
  args: { evaluationId: string; userId: string; role: string },
): Promise<QueryResultRow | undefined> {
  const result = await db.query<QueryResultRow>(
    `SELECT e.id AS evaluation_id, e.status, a.species, a.breed,
            i.id AS image_id, i.file_path
     FROM evaluations e
     JOIN animals a ON a.id = e.animal_id
     JOIN LATERAL (
       SELECT id, file_path
       FROM images
       WHERE evaluation_id = e.id
       ORDER BY CASE WHEN view_type = 'side' THEN 0 ELSE 1 END, id
       LIMIT 1
     ) i ON TRUE
     WHERE e.id = $1::uuid
       AND ($2 <> 'typer' OR e.evaluator_id = $3::uuid)
     LIMIT 1`,
    [args.evaluationId, args.role, args.userId],
  );
  return result.rows[0];
}

export async function getEvaluationForRecompute(
  db: Pick<Pool, 'query'>,
  args: EvaluationAccessScope & { evaluationId: string },
): Promise<QueryResultRow | undefined> {
  const result = await db.query<QueryResultRow>(
    `SELECT e.id, e.status, e.pixels_per_cm, a.species, a.breed,
            COALESCE(jsonb_object_agg(l.name, COALESCE(l.corrected_pos, l.estimated_pos))
              FILTER (WHERE l.id IS NOT NULL), '{}'::jsonb) AS landmarks
     FROM evaluations e
     JOIN animals a ON a.id = e.animal_id
     LEFT JOIN landmarks l ON l.evaluation_id = e.id
     WHERE e.id = $1::uuid
       AND ($2 <> 'typer' OR e.evaluator_id = $3::uuid OR a.village IN (
         SELECT DISTINCT own_animal.village
         FROM evaluations own_evaluation
         JOIN animals own_animal ON own_animal.id = own_evaluation.animal_id
         WHERE own_evaluation.evaluator_id = $3::uuid AND own_animal.village IS NOT NULL
       ))
     GROUP BY e.id, a.id
     LIMIT 1`,
    [args.evaluationId, args.role, args.userId],
  );
  return result.rows[0];
}

export async function persistLandmarkRecompute(
  db: Connectable,
  input: {
    evaluationId: string;
    landmarks: Record<string, { x: number; y: number }>;
    result: RecomputeResponse;
  },
) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const [name, coordinate] of Object.entries(input.landmarks)) {
      const update = await client.query(
        `UPDATE landmarks SET corrected_pos = $1::jsonb
         WHERE evaluation_id = $2::uuid AND name = $3`,
        [JSON.stringify(coordinate), input.evaluationId, name],
      );
      if (update.rowCount === 0) throw new LandmarkNotFoundError(`Landmark ${name} not found`);
    }
    await persistRecomputedMeasurementsAndScores(client, input.evaluationId, input.result);
    const evaluation = await loadEvaluationAggregate(client, input.evaluationId);
    await client.query('COMMIT');
    return evaluation;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function overrideTraitScores(
  db: Connectable,
  input: {
    evaluationId: string;
    changedBy: string;
    scores: Array<{ trait_name: string; final_score: number; override_reason: string }>;
  },
) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const score of input.scores) {
      const previous = await client.query<{ final_score: number }>(
        `SELECT final_score FROM trait_scores
         WHERE evaluation_id = $1::uuid AND trait_name = $2 FOR UPDATE`,
        [input.evaluationId, score.trait_name],
      );
      if (previous.rowCount === 0) throw new TraitScoreNotFoundError(`Trait ${score.trait_name} not found`);
      await client.query(
        `INSERT INTO score_override_audit
           (id, evaluation_id, trait_name, previous_score, final_score, override_reason, changed_by)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid)`,
        [randomUUID(), input.evaluationId, score.trait_name, previous.rows[0].final_score,
          score.final_score, score.override_reason.trim(), input.changedBy],
      );
      await client.query(
        `UPDATE trait_scores SET final_score = $1, override_reason = $2
         WHERE evaluation_id = $3::uuid AND trait_name = $4`,
        [score.final_score, score.override_reason.trim(), input.evaluationId, score.trait_name],
      );
    }
    await client.query(
      `UPDATE evaluations
       SET overall_score = (
         SELECT ROUND(((AVG(final_score)::numeric - 1) / 8) * 100, 2)::double precision
         FROM trait_scores WHERE evaluation_id = $1::uuid
       ), status = 'confirmed'::"EvaluationStatus", updated_at = NOW()
       WHERE id = $1::uuid`,
      [input.evaluationId],
    );
    const evaluation = await loadEvaluationAggregate(client, input.evaluationId);
    await client.query('COMMIT');
    return evaluation;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function persistRecomputedMeasurementsAndScores(
  client: PoolClient,
  evaluationId: string,
  result: RecomputeResponse,
): Promise<void> {
  for (const [name, measurement] of Object.entries(result.measurements)) {
    const value = typeof measurement === 'number' ? measurement : measurement.value;
    const unit = typeof measurement === 'number' ? defaultMeasurementUnit(name) : measurement.unit ?? defaultMeasurementUnit(name);
    const confidence = typeof measurement === 'number' ? null : measurement.confidence ?? null;
    await client.query(
      `INSERT INTO measurements (id, evaluation_id, name, value, unit, confidence)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
       ON CONFLICT (evaluation_id, name) DO UPDATE
       SET value = EXCLUDED.value, unit = EXCLUDED.unit, confidence = EXCLUDED.confidence`,
      [randomUUID(), evaluationId, name, value, unit, confidence],
    );
  }
  for (const [traitName, score] of Object.entries(result.trait_scores)) {
    const aiScore = typeof score === 'number' ? score : score.score;
    await client.query(
      `INSERT INTO trait_scores (id, evaluation_id, trait_name, ai_score, final_score)
       VALUES ($1::uuid, $2::uuid, $3, $4, $4)
       ON CONFLICT (evaluation_id, trait_name) DO UPDATE
       SET ai_score = EXCLUDED.ai_score, final_score = EXCLUDED.final_score, override_reason = NULL`,
      [randomUUID(), evaluationId, traitName, aiScore],
    );
  }
  await client.query(
    `UPDATE evaluations
     SET overall_score = $1, status = 'analyzed'::"EvaluationStatus", updated_at = NOW()
     WHERE id = $2::uuid`,
    [result.overall_score, evaluationId],
  );
}

const blockingQualityFlags = new Set(['blurry', 'too_dark', 'too_bright', 'wrong_orientation', 'low_resolution']);

export async function persistAnalysisResult(
  db: Connectable,
  input: { evaluationId: string; imageId: string; analysis: AnalysisResponse },
) {
  const client = await db.connect();
  const hasBlockingQualityError = input.analysis.quality_flags.some((flag) => blockingQualityFlags.has(flag));
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE images SET quality_flags = $1::jsonb WHERE id = $2::uuid AND evaluation_id = $3::uuid',
      [JSON.stringify(input.analysis.quality_flags), input.imageId, input.evaluationId],
    );

    if (hasBlockingQualityError) {
      await client.query(
        'UPDATE evaluations SET status = \'failed_quality\'::"EvaluationStatus", updated_at = NOW() WHERE id = $1::uuid',
        [input.evaluationId],
      );
    } else {
      for (const [name, point] of Object.entries(input.analysis.landmarks)) {
        await client.query(
          `INSERT INTO landmarks (id, evaluation_id, name, estimated_pos, confidence)
           VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5)
           ON CONFLICT (evaluation_id, name) DO UPDATE
           SET estimated_pos = EXCLUDED.estimated_pos, confidence = EXCLUDED.confidence`,
          [randomUUID(), input.evaluationId, name, JSON.stringify({ x: point.x, y: point.y }), point.confidence ?? null],
        );
      }

      for (const [name, measurement] of Object.entries(input.analysis.measurements)) {
        const value = typeof measurement === 'number' ? measurement : measurement.value;
        const unit = typeof measurement === 'number' ? defaultMeasurementUnit(name) : measurement.unit ?? defaultMeasurementUnit(name);
        const confidence = typeof measurement === 'number' ? null : measurement.confidence ?? null;
        await client.query(
          `INSERT INTO measurements (id, evaluation_id, name, value, unit, confidence)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
           ON CONFLICT (evaluation_id, name) DO UPDATE
           SET value = EXCLUDED.value, unit = EXCLUDED.unit, confidence = EXCLUDED.confidence`,
          [randomUUID(), input.evaluationId, name, value, unit, confidence],
        );
      }

      for (const [traitName, score] of Object.entries(input.analysis.trait_scores)) {
        await client.query(
          `INSERT INTO trait_scores (id, evaluation_id, trait_name, ai_score, final_score)
           VALUES ($1::uuid, $2::uuid, $3, $4, $4)
           ON CONFLICT (evaluation_id, trait_name) DO UPDATE
           SET ai_score = EXCLUDED.ai_score, final_score = EXCLUDED.final_score, override_reason = NULL`,
          [randomUUID(), input.evaluationId, traitName, score],
        );
      }

      await client.query(
        `UPDATE evaluations
         SET overall_score = $1, pipeline_version = $2, pixels_per_cm = $3,
             status = 'analyzed'::"EvaluationStatus", updated_at = NOW()
         WHERE id = $4::uuid`,
        [input.analysis.overall_score, input.analysis.pipeline_version ?? null, input.analysis.pixels_per_cm ?? null, input.evaluationId],
      );
    }

    const evaluation = await loadEvaluationAggregate(client, input.evaluationId);
    await client.query('COMMIT');
    return { evaluation, qualityErrors: hasBlockingQualityError ? input.analysis.quality_flags : [] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function loadEvaluationAggregate(client: PoolClient, evaluationId: string): Promise<QueryResultRow | undefined> {
  const result = await client.query<QueryResultRow>(
    `SELECT e.id, e.animal_id, e.evaluator_id, e.status, e.overall_score, e.pipeline_version, e.pixels_per_cm,
            e.created_at, e.updated_at,
            jsonb_build_object('id', a.id, 'tag_id', a.tag_id, 'species', a.species, 'breed', a.breed,
                               'owner_name', a.owner_name, 'village', a.village) AS animal,
            jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', u.role) AS evaluator,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'view_type', i.view_type,
                   'file_path', i.file_path, 'quality_flags', i.quality_flags)) FROM images i WHERE i.evaluation_id = e.id), '[]'::jsonb) AS images,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name,
                   'estimated_pos', l.estimated_pos, 'corrected_pos', l.corrected_pos, 'confidence', l.confidence))
                   FROM landmarks l WHERE l.evaluation_id = e.id), '[]'::jsonb) AS landmarks,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'value', m.value,
                   'unit', m.unit, 'confidence', m.confidence)) FROM measurements m WHERE m.evaluation_id = e.id), '[]'::jsonb) AS measurements,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'trait_name', t.trait_name,
                   'ai_score', t.ai_score, 'final_score', t.final_score, 'override_reason', t.override_reason))
                   FROM trait_scores t WHERE t.evaluation_id = e.id), '[]'::jsonb) AS trait_scores,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'status', b.status, 'attempts', b.attempts,
                   'last_error', b.last_error, 'synced_at', b.synced_at)) FROM bpa_sync b WHERE b.evaluation_id = e.id), '[]'::jsonb) AS bpa_sync,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', audit.id, 'trait_name', audit.trait_name,
                   'previous_score', audit.previous_score, 'final_score', audit.final_score,
                   'override_reason', audit.override_reason, 'changed_by', audit.changed_by,
                   'changed_by_name', audit_user.name, 'changed_at', audit.changed_at)
                   ORDER BY audit.changed_at DESC)
                   FROM score_override_audit audit JOIN users audit_user ON audit_user.id = audit.changed_by
                   WHERE audit.evaluation_id = e.id), '[]'::jsonb) AS score_override_audit
     FROM evaluations e
     JOIN animals a ON a.id = e.animal_id
     JOIN users u ON u.id = e.evaluator_id
     WHERE e.id = $1::uuid`,
    [evaluationId],
  );
  return result.rows[0];
}

function defaultMeasurementUnit(name: string): string {
  return /angle/i.test(name) ? 'deg' : 'cm';
}

export function getEvaluationDatabase(): Connectable {
  if (!pool) throw new DatabaseUnavailableError('Database is unavailable');
  return pool;
}
