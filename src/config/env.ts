import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL:             z.string().url(),
  JWT_SECRET:               z.string().min(32),
  JWT_EXPIRES_IN:           z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
  REDIS_URL:                z.string().default('redis://localhost:6381'),
  CLOUDFLARE_R2_BUCKET:     z.string().min(1),
  CLOUDFLARE_R2_ENDPOINT:   z.string().url(),
  CLOUDFLARE_R2_ACCESS_KEY: z.string().min(1),
  CLOUDFLARE_R2_SECRET_KEY: z.string().min(1),
  GEMINI_API_KEY:           z.string().min(1),
  PORT:                     z.coerce.number().default(3000),
  NODE_ENV:                 z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
