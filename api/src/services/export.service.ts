import type { Pool, QueryResultRow } from 'pg';
import { stringify } from 'csv-stringify';

export interface EvaluationExportFilters {
  from_date?: string;
  to_date?: string;
  breed?: string;
  species?: 'cattle' | 'buffalo';
}

export const csvColumns = [
  'evaluation_id',
  'tag_id',
  'species',
  'breed',
  'owner_name',
  'village',
  'evaluator_name',
  'date',
  'height_at_withers_cm',
  'body_length_cm',
  'body_depth_cm',
  'rump_angle_deg',
  'stature_score',
  'body_length_score',
  'body_depth_score',
  'rump_angle_score',
  'overall_score',
  'bpa_sync_status',
] as const;

export async function getEvaluationExportRows(db: Pick<Pool, 'query'>, filters: EvaluationExportFilters): Promise<QueryResultRow[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const addFilter = (clause: (placeholder: string) => string, value: unknown) => {
    values.push(value);
    clauses.push(clause(`$${values.length}`));
  };
  if (filters.from_date) addFilter((p) => `e.created_at >= ${p}::date`, filters.from_date);
  if (filters.to_date) addFilter((p) => `e.created_at < (${p}::date + INTERVAL '1 day')`, filters.to_date);
  if (filters.breed) addFilter((p) => `a.breed ILIKE ${p}`, `%${filters.breed}%`);
  if (filters.species) addFilter((p) => `a.species = ${p}::"Species"`, filters.species);

  const result = await db.query<QueryResultRow>(
    `SELECT e.id AS evaluation_id, e.overall_score, e.created_at,
            a.tag_id, a.species, a.breed, a.owner_name, a.village,
            u.name AS evaluator_name,
            COALESCE((SELECT jsonb_object_agg(m.name, m.value)
                      FROM measurements m WHERE m.evaluation_id = e.id), '{}'::jsonb) AS measurements,
            COALESCE((SELECT jsonb_object_agg(t.trait_name, t.final_score)
                      FROM trait_scores t WHERE t.evaluation_id = e.id), '{}'::jsonb) AS scores,
            COALESCE((SELECT b.status::text FROM bpa_sync b
                      WHERE b.evaluation_id = e.id ORDER BY b.created_at DESC LIMIT 1), 'pending') AS bpa_sync_status
     FROM evaluations e
     JOIN animals a ON a.id = e.animal_id
     JOIN users u ON u.id = e.evaluator_id
     ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY e.created_at DESC, e.id DESC`,
    values,
  );
  return result.rows;
}

export interface EvaluationExportRecord {
  evaluation_id: string;
  tag_id: string;
  species: string;
  breed: string;
  owner_name: string | null;
  village: string | null;
  evaluator_name: string;
  date: string;
  height_at_withers_cm: number | null;
  body_length_cm: number | null;
  body_depth_cm: number | null;
  rump_angle_deg: number | null;
  stature_score: number | null;
  body_length_score: number | null;
  body_depth_score: number | null;
  rump_angle_score: number | null;
  overall_score: number | null;
  bpa_sync_status: string;
}

export function toCsvRecords(rows: QueryResultRow[]): EvaluationExportRecord[] {
  return rows.map((row) => {
    const measurements = asNumberMap(row.measurements);
    const scores = asNumberMap(row.scores);
    return {
      evaluation_id: String(row.evaluation_id),
      tag_id: String(row.tag_id),
      species: String(row.species),
      breed: String(row.breed),
      owner_name: row.owner_name == null ? null : String(row.owner_name),
      village: row.village == null ? null : String(row.village),
      evaluator_name: String(row.evaluator_name),
      date: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(String(row.created_at)).toISOString(),
      height_at_withers_cm: firstNumber(measurements, ['height_at_withers_cm', 'height_at_withers']),
      body_length_cm: firstNumber(measurements, ['body_length_cm', 'body_length']),
      body_depth_cm: firstNumber(measurements, ['body_depth_cm', 'body_depth']),
      rump_angle_deg: firstNumber(measurements, ['rump_angle_deg', 'rump_angle']),
      stature_score: firstNumber(scores, ['stature']),
      body_length_score: firstNumber(scores, ['body_length', 'bodyLength']),
      body_depth_score: firstNumber(scores, ['body_depth', 'bodyDepth']),
      rump_angle_score: firstNumber(scores, ['rump_angle', 'rumpAngle']),
      overall_score: row.overall_score == null ? null : Number(row.overall_score),
      bpa_sync_status: String(row.bpa_sync_status ?? 'pending'),
    };
  });
}

export function toJsonRecords(rows: QueryResultRow[]) {
  return rows.map((row) => {
    const record = toCsvRecords([row])[0];
    return {
      evaluation_id: record.evaluation_id,
      animal: {
        tag_id: record.tag_id,
        species: record.species,
        breed: record.breed,
        owner_name: record.owner_name,
        village: record.village,
      },
      evaluator: { name: record.evaluator_name },
      evaluation_timestamp: record.date,
      measurements: {
        height_at_withers_cm: record.height_at_withers_cm,
        body_length_cm: record.body_length_cm,
        body_depth_cm: record.body_depth_cm,
        rump_angle_deg: record.rump_angle_deg,
      },
      linear_scores: {
        stature: record.stature_score,
        body_length: record.body_length_score,
        body_depth: record.body_depth_score,
        rump_angle: record.rump_angle_score,
      },
      overall_score: record.overall_score,
      bpa_sync_status: record.bpa_sync_status,
    };
  });
}

export function createCsvStringifier() {
  return stringify({ header: true, columns: [...csvColumns] });
}

function asNumberMap(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, raw]) => {
    const numeric = Number(raw);
    return raw !== null && Number.isFinite(numeric) ? [[key, numeric]] : [];
  }));
}

function firstNumber(values: Record<string, number>, aliases: string[]): number | null {
  for (const alias of aliases) if (alias in values) return values[alias];
  return null;
}
