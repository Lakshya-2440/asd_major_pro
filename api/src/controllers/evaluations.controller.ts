import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/database';
import { analysisClient, AnalysisServiceError } from '../services/analysis.service';
import {
  AnimalNotFoundError,
  createDraftEvaluation,
  DatabaseUnavailableError,
  evaluationStatuses,
  findEvaluationImage,
  getEvaluationDetail,
  getEvaluationForAnalysis,
  getEvaluationForRecompute,
  listEvaluations as listEvaluationRecords,
  LandmarkNotFoundError,
  overrideTraitScores,
  persistAnalysisResult,
  persistLandmarkRecompute,
  TraitScoreNotFoundError,
} from '../services/evaluations.service';
import { removeUploadedFile, resolveStoredImage } from '../services/storage.service';

export const evaluationDraftSchema = z.object({
  animal_id: z.string().uuid(),
  view_type: z.enum(['side', 'rear', 'front']).default('side'),
}).strict();

export const evaluationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  species: z.enum(['cattle', 'buffalo']).optional(),
  breed: z.string().trim().min(1).max(100).optional(),
  status: z.enum(evaluationStatuses).optional(),
  village: z.string().trim().min(1).max(200).optional(),
  evaluator_id: z.string().uuid().optional(),
  from_date: z.string().optional().refine(isValidDate, 'Expected a valid YYYY-MM-DD date'),
  to_date: z.string().optional().refine(isValidDate, 'Expected a valid YYYY-MM-DD date'),
}).strict().refine(
  (filters) => !filters.from_date || !filters.to_date || filters.from_date <= filters.to_date,
  { message: 'from_date must be on or before to_date', path: ['to_date'] },
);

export const landmarkPatchSchema = z.object({
  landmarks: z.record(z.string().trim().min(1).max(100), z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }).strict()).refine((landmarks) => Object.keys(landmarks).length > 0 && Object.keys(landmarks).length <= 100),
}).strict();

export const scoreOverrideSchema = z.object({
  scores: z.array(z.object({
    trait_name: z.string().trim().min(1).max(100),
    final_score: z.number().int().min(1).max(9),
    override_reason: z.string().trim().min(5).max(2000),
  }).strict()).min(1).max(100),
}).strict().superRefine((body, context) => {
  const names = body.scores.map((score) => score.trait_name);
  if (new Set(names).size !== names.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Each trait can only appear once per request', path: ['scores'] });
  }
});

export async function listEvaluations(req: Request, res: Response): Promise<void> {
  const parsed = evaluationListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid evaluation filters', details: parsed.error.flatten().fieldErrors });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const result = await listEvaluationRecords(getQueryDatabase(), parsed.data, {
      userId: req.user.userId,
      role: req.user.role,
    });
    res.json(result);
  } catch (error) {
    console.error('Evaluation listing failed', error);
    res.status(503).json({ error: 'Unable to list evaluations' });
  }
}

export async function getEvaluation(req: Request, res: Response): Promise<void> {
  const evaluationId = z.string().uuid().safeParse(req.params.id);
  if (!evaluationId.success) {
    res.status(400).json({ error: 'Invalid evaluation id' });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const evaluation = await getEvaluationDetail(getQueryDatabase(), {
      evaluationId: evaluationId.data,
      userId: req.user.userId,
      role: req.user.role,
    });
    if (!evaluation) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }
    res.json(evaluation);
  } catch (error) {
    console.error('Evaluation detail lookup failed', error);
    res.status(503).json({ error: 'Unable to retrieve evaluation' });
  }
}

export async function patchEvaluationLandmarks(req: Request, res: Response): Promise<void> {
  const evaluationId = z.string().uuid().safeParse(req.params.id);
  const body = landmarkPatchSchema.safeParse(req.body);
  if (!evaluationId.success) {
    res.status(400).json({ error: 'Invalid evaluation id' });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: 'Invalid landmark coordinates', details: body.error.flatten().fieldErrors });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const database = getEvaluationDatabase();
    const record = await getEvaluationForRecompute(database, {
      evaluationId: evaluationId.data,
      userId: req.user.userId,
      role: req.user.role,
    });
    if (!record) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }
    if (record.status !== 'analyzed') {
      res.status(409).json({ error: 'Only analyzed evaluations can be recomputed' });
      return;
    }
    const pixelsPerCm = Number(record.pixels_per_cm);
    if (!Number.isFinite(pixelsPerCm) || pixelsPerCm <= 0) {
      res.status(422).json({ error: 'Evaluation has no valid pixels_per_cm calibration scale' });
      return;
    }
    const storedLandmarks = asCoordinateMap(record.landmarks);
    const unknownLandmarks = Object.keys(body.data.landmarks).filter((name) => !(name in storedLandmarks));
    if (unknownLandmarks.length > 0) {
      res.status(400).json({ error: 'Unknown landmark names', landmarks: unknownLandmarks });
      return;
    }
    const adjustedLandmarks = { ...storedLandmarks, ...body.data.landmarks };
    const recomputed = await analysisClient.recompute(
      adjustedLandmarks,
      pixelsPerCm,
      String(record.species),
      String(record.breed),
    );
    const evaluation = await persistLandmarkRecompute(database, {
      evaluationId: evaluationId.data,
      landmarks: body.data.landmarks,
      result: recomputed,
    });
    if (!evaluation) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }
    res.json(evaluation);
  } catch (error) {
    if (error instanceof AnalysisServiceError) {
      const status = error.statusCode === 422 ? 422 : error.code === 'http_error' || error.code === 'invalid_response' ? 502 : 503;
      res.status(status).json({ error: error.message, code: error.code, ...(error.statusCode ? { service_status: error.statusCode } : {}) });
      return;
    }
    if (error instanceof LandmarkNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('Landmark patch failed', error);
    res.status(error instanceof DatabaseUnavailableError ? 503 : 500).json({ error: 'Unable to update landmarks' });
  }
}

export async function patchEvaluationScores(req: Request, res: Response): Promise<void> {
  const evaluationId = z.string().uuid().safeParse(req.params.id);
  const body = scoreOverrideSchema.safeParse(req.body);
  if (!evaluationId.success) {
    res.status(400).json({ error: 'Invalid evaluation id' });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: 'Invalid score overrides', details: body.error.flatten().fieldErrors });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const database = getEvaluationDatabase();
    const existing = await getEvaluationDetail(database, {
      evaluationId: evaluationId.data,
      userId: req.user.userId,
      role: req.user.role,
    });
    if (!existing) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }
    if (!['analyzed', 'confirmed'].includes(String(existing.status))) {
      res.status(409).json({ error: 'Only analyzed evaluations can have score overrides' });
      return;
    }
    const evaluation = await overrideTraitScores(database, {
      evaluationId: evaluationId.data,
      changedBy: req.user.userId,
      scores: body.data.scores,
    });
    if (!evaluation) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }
    res.json(evaluation);
  } catch (error) {
    if (error instanceof TraitScoreNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('Score override failed', error);
    res.status(error instanceof DatabaseUnavailableError ? 503 : 500).json({ error: 'Unable to override evaluation scores' });
  }
}

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

export async function analyzeEvaluation(req: Request, res: Response): Promise<void> {
  const parsedId = z.string().uuid().safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ error: 'Invalid evaluation id' });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const database = getEvaluationDatabase();
    const record = await getEvaluationForAnalysis(database, {
      evaluationId: parsedId.data,
      userId: req.user.userId,
      role: req.user.role,
    });
    if (!record) {
      res.status(404).json({ error: 'Evaluation or image not found' });
      return;
    }
    if (!['draft', 'pending_analysis', 'failed_quality'].includes(String(record.status))) {
      res.status(409).json({ error: 'Evaluation cannot be analyzed in its current status' });
      return;
    }
    const imagePath = resolveStoredImage(String(record.file_path));
    if (!imagePath) {
      res.status(404).json({ error: 'Evaluation image not found' });
      return;
    }

    const analysis = await analysisClient.analyzeSideView(imagePath, String(record.species), String(record.breed));
    const result = await persistAnalysisResult(database, {
      evaluationId: String(record.evaluation_id),
      imageId: String(record.image_id),
      analysis,
    });
    if (!result.evaluation) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }
    if (result.qualityErrors.length > 0) {
      res.status(422).json({ evaluation: result.evaluation, quality_flags: result.qualityErrors });
      return;
    }
    res.json(result.evaluation);
  } catch (error) {
    if (error instanceof AnalysisServiceError) {
      const status = error.code === 'http_error' || error.code === 'invalid_response' ? 502 : 503;
      res.status(status).json({
        error: error.message,
        code: error.code,
        ...(error.statusCode ? { service_status: error.statusCode } : {}),
      });
      return;
    }
    console.error('Evaluation analysis failed', error);
    res.status(error instanceof DatabaseUnavailableError ? 503 : 500).json({ error: 'Unable to analyze evaluation' });
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

function isValidDate(value: string | undefined): boolean {
  if (value === undefined) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function asCoordinateMap(value: unknown): Record<string, { x: number; y: number }> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([name, point]) => {
    if (typeof point !== 'object' || point === null || !('x' in point) || !('y' in point)) return [];
    const x = Number(point.x);
    const y = Number(point.y);
    return Number.isFinite(x) && Number.isFinite(y) ? [[name, { x, y }]] : [];
  }));
}
