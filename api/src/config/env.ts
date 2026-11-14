import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().optional(),
  JWT_SECRET: z.string().default('development-only-change-me'),
  ANALYSIS_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  BPA_MOCK_URL: z.string().url().default('http://localhost:3000/mock/bpa/atc-records'),
  FRONTEND_ORIGIN: z.string().default('*'),
  DEMO_MODE: z.coerce.boolean().default(true),
});

export const env = envSchema.parse(process.env);
