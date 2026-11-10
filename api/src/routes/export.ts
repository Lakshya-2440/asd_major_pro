import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/database';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import {
  createCsvStringifier,
  getEvaluationExportRows,
  toCsvRecords,
  toJsonRecords,
} from '../services/export.service';

export const exportQuerySchema = z.object({
  format: z.enum(['csv', 'json']),
  from_date: z.string().optional().refine(isValidDate, 'Expected a valid YYYY-MM-DD date'),
  to_date: z.string().optional().refine(isValidDate, 'Expected a valid YYYY-MM-DD date'),
  breed: z.string().trim().min(1).max(100).optional(),
  species: z.enum(['cattle', 'buffalo']).optional(),
}).strict().refine(
  (filters) => !filters.from_date || !filters.to_date || filters.from_date <= filters.to_date,
  { message: 'from_date must be on or before to_date', path: ['to_date'] },
);

const exportRouter = Router();
exportRouter.use(authenticateToken, authorizeRoles('supervisor', 'admin'));

exportRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = exportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid export filters', details: parsed.error.flatten().fieldErrors });
    return;
  }
  if (!pool) {
    res.status(503).json({ error: 'Database is unavailable' });
    return;
  }

  try {
    const { format, ...filters } = parsed.data;
    const rows = await getEvaluationExportRows(pool, filters);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'json') {
      res.status(200)
        .type('application/json')
        .attachment(`evaluations_export_${timestamp}.json`)
        .send(JSON.stringify(toJsonRecords(rows), null, 2));
      return;
    }

    res.status(200)
      .type('text/csv; charset=utf-8')
      .attachment(`evaluations_export_${timestamp}.csv`);
    await pipeline(Readable.from(toCsvRecords(rows)), createCsvStringifier(), res);
  } catch (error) {
    console.error('Evaluation export failed', error);
    if (res.headersSent) {
      res.destroy(error instanceof Error ? error : undefined);
      return;
    }
    res.status(503).json({ error: 'Unable to export evaluations' });
  }
});

function isValidDate(value: string | undefined): boolean {
  if (value === undefined) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default exportRouter;
