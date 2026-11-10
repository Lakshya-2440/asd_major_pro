import type { Pool, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../config/database';

export type AnimalSpecies = 'cattle' | 'buffalo';

export interface CreateAnimalInput {
  tag_id: string;
  species: AnimalSpecies;
  breed: string;
  owner_name: string;
  village: string;
}

type Queryable = Pick<Pool, 'query'>;

export function createAnimalsService(db: Queryable) {
  return {
    async create(input: CreateAnimalInput): Promise<QueryResultRow> {
      const result = await db.query(
        `INSERT INTO animals (id, tag_id, species, breed, owner_name, village)
         VALUES (gen_random_uuid(), $1, $2::"Species", $3, $4, $5)
         RETURNING id, tag_id, species, breed, owner_name, village, created_at`,
        [input.tag_id, input.species, input.breed, input.owner_name, input.village],
      );
      return result.rows[0];
    },

    async list(tag?: string): Promise<QueryResultRow[]> {
      const normalizedTag = tag?.trim();
      const result: QueryResult<QueryResultRow> = normalizedTag
        ? await db.query(
          `SELECT a.id, a.tag_id, a.species, a.breed, a.owner_name, a.village, a.created_at,
                  COUNT(e.id)::int AS previous_evaluations_count
           FROM animals a
           LEFT JOIN evaluations e ON e.animal_id = a.id
           WHERE a.tag_id = $1 OR a.tag_id LIKE $2 ESCAPE '\\'
           GROUP BY a.id
           ORDER BY a.tag_id
           LIMIT 100`,
          [normalizedTag, `${escapeLikePrefix(normalizedTag)}%`],
        )
        : await db.query(
          `SELECT a.id, a.tag_id, a.species, a.breed, a.owner_name, a.village, a.created_at,
                  COUNT(e.id)::int AS previous_evaluations_count
           FROM animals a
           LEFT JOIN evaluations e ON e.animal_id = a.id
           GROUP BY a.id
           ORDER BY a.created_at DESC
           LIMIT 100`,
        );
      return result.rows;
    },

    async getById(id: string): Promise<QueryResultRow | undefined> {
      const result = await db.query(
        `SELECT a.id, a.tag_id, a.species, a.breed, a.owner_name, a.village, a.created_at,
                COUNT(e.id)::int AS evaluations_count,
                MAX(e.created_at) AS last_evaluation_at,
                COALESCE(
                  jsonb_object_agg(e.status, status_counts.count) FILTER (WHERE e.status IS NOT NULL),
                  '{}'::jsonb
                ) AS evaluations_by_status
         FROM animals a
         LEFT JOIN evaluations e ON e.animal_id = a.id
         LEFT JOIN LATERAL (
           SELECT status, COUNT(*)::int AS count
           FROM evaluations
           WHERE animal_id = a.id
           GROUP BY status
         ) status_counts ON status_counts.status = e.status
         WHERE a.id = $1::uuid
         GROUP BY a.id`,
        [id],
      );
      return result.rows[0];
    },
  };
}

function escapeLikePrefix(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function getAnimalsService() {
  if (!pool) throw new Error('Database is unavailable');
  return createAnimalsService(pool);
}
