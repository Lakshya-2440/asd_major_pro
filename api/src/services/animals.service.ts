import { randomUUID } from 'node:crypto';
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

const memoryAnimals: QueryResultRow[] = [
  {
    id: '76r70000-0000-4000-8000-000000000001',
    tag_id: '76R7',
    species: 'cattle',
    breed: 'Gir',
    owner_name: 'Ramesh Patel',
    village: 'Anand, Gujarat',
    created_at: new Date().toISOString(),
    previous_evaluations_count: 1,
  },
  {
    id: 'mu409100-0000-4000-8000-000000000002',
    tag_id: 'MU-4091',
    species: 'buffalo',
    breed: 'Murrah',
    owner_name: 'Suresh Kumar',
    village: 'Rohtak, Haryana',
    created_at: new Date().toISOString(),
    previous_evaluations_count: 2,
  },
];

const inMemoryService = {
  async create(input: CreateAnimalInput): Promise<QueryResultRow> {
    const existing = memoryAnimals.find((a) => a.tag_id.toUpperCase() === input.tag_id.toUpperCase());
    if (existing) {
      const err: any = new Error('Duplicate key');
      err.code = '23505';
      throw err;
    }
    const newAnimal: QueryResultRow = {
      id: randomUUID(),
      tag_id: input.tag_id,
      species: input.species,
      breed: input.breed,
      owner_name: input.owner_name,
      village: input.village,
      created_at: new Date().toISOString(),
      previous_evaluations_count: 0,
    };
    memoryAnimals.unshift(newAnimal);
    return newAnimal;
  },

  async list(tag?: string): Promise<QueryResultRow[]> {
    if (!tag || !tag.trim()) return [...memoryAnimals];
    const q = tag.trim().toUpperCase();
    return memoryAnimals.filter((a) => a.tag_id.toUpperCase().includes(q));
  },

  async getById(id: string): Promise<QueryResultRow | undefined> {
    const found = memoryAnimals.find((a) => a.id === id || a.tag_id.toUpperCase() === id.toUpperCase());
    if (!found) return undefined;
    return {
      ...found,
      evaluations_count: found.previous_evaluations_count || 1,
      last_evaluation_at: new Date().toISOString(),
      evaluations_by_status: { confirmed: 1 },
    };
  },
};

type Queryable = Pick<Pool, 'query'>;

export function createAnimalsService(db: Queryable) {
  return {
    async create(input: CreateAnimalInput): Promise<QueryResultRow> {
      try {
        const result = await db.query(
          `INSERT INTO animals (id, tag_id, species, breed, owner_name, village)
           VALUES (gen_random_uuid(), $1, $2::"Species", $3, $4, $5)
           RETURNING id, tag_id, species, breed, owner_name, village, created_at`,
          [input.tag_id, input.species, input.breed, input.owner_name, input.village],
        );
        return result.rows[0];
      } catch (err: any) {
        if (err?.code === '23505') throw err;
        console.warn('DB query failed, fallback to memory store:', err?.message);
        return inMemoryService.create(input);
      }
    },

    async list(tag?: string): Promise<QueryResultRow[]> {
      try {
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
      } catch (err: any) {
        console.warn('DB list failed, fallback to memory store:', err?.message);
        return inMemoryService.list(tag);
      }
    },

    async getById(id: string): Promise<QueryResultRow | undefined> {
      try {
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
      } catch (err: any) {
        console.warn('DB getById failed, fallback to memory store:', err?.message);
        return inMemoryService.getById(id);
      }
    },
  };
}

function escapeLikePrefix(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function getAnimalsService() {
  if (!pool) return inMemoryService;
  return createAnimalsService(pool);
}
