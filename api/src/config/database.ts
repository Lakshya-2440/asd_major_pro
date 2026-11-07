import { Pool } from 'pg';
import { env } from './env';

export const pool = env.DATABASE_URL ? new Pool({ connectionString: env.DATABASE_URL }) : null;

export async function getDatabaseStatus(): Promise<'connected' | 'disconnected'> {
  if (!pool) return 'disconnected';

  try {
    await pool.query('SELECT 1');
    return 'connected';
  } catch {
    return 'disconnected';
  }
}
