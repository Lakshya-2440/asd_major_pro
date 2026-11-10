import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import axios, { type AxiosInstance } from 'axios';
import { env } from '../config/env';

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  confidence: z.number().finite().optional(),
}).passthrough();

const measurementSchema = z.union([
  z.number().finite(),
  z.object({
    value: z.number().finite(),
    unit: z.string().optional(),
    confidence: z.number().finite().optional(),
  }).passthrough(),
]);

export const analysisResponseSchema = z.object({
  species: z.string().optional(),
  breed: z.string().optional(),
  pipeline_version: z.string().optional(),
  quality_flags: z.array(z.string()).default([]),
  landmarks: z.record(z.string(), pointSchema).default({}),
  measurements: z.record(z.string(), measurementSchema).default({}),
  trait_scores: z.record(z.string(), z.number().int().min(1).max(9)).default({}),
  overall_score: z.number().finite().default(0),
});

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;

export class AnalysisServiceError extends Error {
  constructor(
    message: string,
    readonly code: 'timeout' | 'unavailable' | 'http_error' | 'invalid_response',
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'AnalysisServiceError';
  }
}

export class AnalysisClient {
  constructor(
    private readonly baseUrl = env.ANALYSIS_SERVICE_URL,
    private readonly http: AxiosInstance = axios.create(),
    private readonly timeoutMs = 15_000,
  ) {}

  async analyzeSideView(imagePath: string, species: string, breed: string): Promise<AnalysisResponse> {
    let imageBytes: Buffer;
    try {
      imageBytes = await fs.readFile(imagePath);
    } catch {
      throw new AnalysisServiceError('Uploaded image is unavailable', 'unavailable');
    }

    const form = new FormData();
    form.set('side_view', new Blob([new Uint8Array(imageBytes)], { type: mimeTypeForPath(imagePath) }), path.basename(imagePath));
    form.set('species', species);
    form.set('breed', breed);

    let response;
    try {
      response = await this.http.post(
        `${this.baseUrl.replace(/\/$/, '')}/predict`,
        form,
        { timeout: this.timeoutMs },
      );
    } catch (error) {
      const isAxiosError = axios.isAxiosError(error);
      const statusCode = isAxiosError ? error.response?.status : undefined;
      if (statusCode) {
        throw new AnalysisServiceError(`Analysis service returned HTTP ${statusCode}`, 'http_error', statusCode);
      }
      const timedOut = isAxiosError && ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? '');
      throw new AnalysisServiceError(
        timedOut ? 'Analysis service request timed out' : 'Analysis service is unavailable',
        timedOut ? 'timeout' : 'unavailable',
      );
    }
    const parsed = analysisResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new AnalysisServiceError('Analysis service returned an invalid result', 'invalid_response', response.status);
    }
    return parsed.data;
  }
}

export const analysisClient = new AnalysisClient();

function mimeTypeForPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png': return 'image/png';
    case '.jpeg':
    case '.jpg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}
