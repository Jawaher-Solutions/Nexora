// lib/r2.ts
// RULE: This file ONLY initializes and exports the Cloudflare R2 (S3) client singleton.

import { S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';

const globalForR2 = globalThis as unknown as { r2: S3Client };

export const r2 = globalForR2.r2 ?? new S3Client({
  region: 'auto',
  endpoint: env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_KEY,
  },
});

if (env.NODE_ENV !== 'production') globalForR2.r2 = r2;
