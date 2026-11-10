import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/database';
import { AnimalNotFoundError, createDraftEvaluation, DatabaseUnavailableError, findEvaluationImage } from '../services/evaluations.service';
import { removeUploadedFile, resolveStoredImage } from '../services/storage.service';

export const evaluationDraftSchema = z.object({
  animal_id: z.string().uuid(),
  view_type: z.enum(['side', 'rear', 'front']).default('side'),
}).strict();

export async function createEvaluation(req: Request, res: Response): Promise<void> {
  const parsed = evaluationDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    await removeUploadedFile(req.file?.path).catch(() => undefined);
    res.status(400).json({ error: 'Invalid evaluation details', details: parsed.error.flatten().fieldErrors });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'An image file is required' });
    return;
  }
  if (!req.user) {
    await removeUploadedFile(req.file.path).catch(() => undefined);
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const database = getEvaluationDatabase();
    const created = await createDraftEvaluation(database, {
      animalId: parsed.data.animal_id,
      evaluatorId: req.user.userId,
      viewType: parsed.data.view_type,
      filePath: req.file.filename,
    });
    res.status(201).json({
      evaluation_id: created.evaluationId,
      status: created.status,
      image_url: `/api/evaluations/${created.evaluationId}/images/${created.imageId}`,
    });
  } catch (error) {
    await removeUploadedFile(req.file.path).catch(() => undefined);
    if (error instanceof AnimalNotFoundError) {
      res.status(404).json({ error: 'Animal not found' });
      return;
    }
    if (isForeignKeyViolation(error)) {
      res.status(404).json({ error: 'Animal or evaluator not found' });
      return;
    }
    console.error('Evaluation creation failed', error);
    res.status(error instanceof DatabaseUnavailableError ? 503 : 500).json({ error: 'Unable to create evaluation' });
  }
}

export async function getEvaluationImage(req: Request, res: Response): Promise<void> {
  const routeParams = z.object({ evaluationId: z.string().uuid(), imageId: z.string().uuid() }).safeParse(req.params);
  if (!routeParams.success || !req.user) {
    res.status(routeParams.success ? 401 : 400).json({ error: routeParams.success ? 'Authentication required' : 'Invalid image URL' });
    return;
  }
  try {
    const record = await findEvaluationImage(getQueryDatabase(), {
      ...routeParams.data,
      userId: req.user.userId,
      role: req.user.role,
    });
    if (!record) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }
    const imagePath = resolveStoredImage(String(record.file_path));
    if (!imagePath) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }
    res.sendFile(imagePath, (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: 'Image not found' });
    });
  } catch (error) {
    console.error('Evaluation image lookup failed', error);
    res.status(503).json({ error: 'Unable to retrieve image' });
  }
}

function getEvaluationDatabase() {
  if (!pool) throw new DatabaseUnavailableError('Database is unavailable');
  return pool;
}

function getQueryDatabase() {
  if (!pool) throw new DatabaseUnavailableError('Database is unavailable');
  return pool;
}

function isForeignKeyViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23503';
}
