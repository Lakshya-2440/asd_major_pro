import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import { env } from '../config/env';

const bpaPayloadSchema = z.object({
  tagId: z.string().min(1),
  evaluatorCode: z.string().min(1),
  evaluationTimestamp: z.string().datetime(),
  linearScores: z.object({
    stature: z.number().int().min(1).max(9),
    bodyLength: z.number().int().min(1).max(9),
    bodyDepth: z.number().int().min(1).max(9),
    rumpAngle: z.number().int().min(1).max(9),
  }).strict(),
  overallScore: z.number().finite().min(0).max(100),
  deviceMetadata: z.object({ pipelineVersion: z.string().min(1) }).strict(),
}).strict();

export type BpaAtcPayload = z.infer<typeof bpaPayloadSchema>;

export class BpaAdapterError extends Error {
  constructor(message: string, readonly code: 'invalid_payload' | 'timeout' | 'unavailable' | 'http_error' | 'invalid_response') {
    super(message);
    this.name = 'BpaAdapterError';
  }
}

export function transformEvaluationToBpaPayload(evaluation: Record<string, any>): BpaAtcPayload {
  const scores = normalizeScores(evaluation.trait_scores ?? evaluation.traitScores);
  const evaluationDate = new Date(String(evaluation.created_at ?? evaluation.createdAt));
  if (Number.isNaN(evaluationDate.getTime())) {
    throw new BpaAdapterError('Evaluation timestamp is invalid', 'invalid_payload');
  }
  const payload = {
    tagId: String(evaluation.animal?.tag_id ?? evaluation.animal?.tagId ?? ''),
    evaluatorCode: String(evaluation.evaluator?.code ?? evaluation.evaluator?.id ?? ''),
    evaluationTimestamp: evaluationDate.toISOString(),
    linearScores: {
      stature: scores.stature,
      bodyLength: scores.body_length ?? scores.bodyLength,
      bodyDepth: scores.body_depth ?? scores.bodyDepth,
      rumpAngle: scores.rump_angle ?? scores.rumpAngle,
    },
    overallScore: Number(evaluation.overall_score ?? evaluation.overallScore),
    deviceMetadata: { pipelineVersion: String(evaluation.pipeline_version ?? evaluation.pipelineVersion ?? '') },
  };
  const parsed = bpaPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new BpaAdapterError(`Evaluation cannot be mapped to a BPA ATC record: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`, 'invalid_payload');
  }
  return parsed.data;
}

export class BpaClient {
  constructor(
    private readonly endpoint = env.BPA_MOCK_URL,
    private readonly http: AxiosInstance = axios.create(),
    private readonly timeoutMs = 5_000,
  ) {}

  async submit(payload: BpaAtcPayload): Promise<{ bpaReferenceId: string }> {
    try {
      const response = await this.http.post(this.endpoint, payload, { timeout: this.timeoutMs });
      const parsed = z.object({ bpaReferenceId: z.string().min(1) }).safeParse(response.data);
      if (!parsed.success) throw new BpaAdapterError('BPA returned an invalid response', 'invalid_response');
      return parsed.data;
    } catch (error) {
      if (error instanceof BpaAdapterError) throw error;
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status) throw new BpaAdapterError(`BPA returned HTTP ${status}`, 'http_error');
        const timeout = ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? '');
        throw new BpaAdapterError(timeout ? 'BPA request timed out' : 'BPA service is unavailable', timeout ? 'timeout' : 'unavailable');
      }
      throw new BpaAdapterError('BPA service is unavailable', 'unavailable');
    }
  }
}

export const bpaClient = new BpaClient();

function normalizeScores(value: unknown): Record<string, number> {
  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.flatMap((score) => typeof score === 'object' && score !== null && 'trait_name' in score
      ? [[String(score.trait_name), 'final_score' in score ? score.final_score : ('ai_score' in score ? score.ai_score : undefined)]]
      : [])
    : typeof value === 'object' && value !== null
      ? Object.entries(value)
      : [];
  return Object.fromEntries(entries.map(([name, score]) => {
    const raw = typeof score === 'object' && score !== null && 'score' in score ? score.score : score;
    return [name, Number(raw)];
  }));
}
