// validators/e2ee.validators.ts
// Zod schemas for E2EE key management inputs.
// RULE: Server validates structure/length only — never inspects cryptographic content.

import { z } from 'zod';

// ─── Identity Key ────────────────────────────────────────────────────────────

export const uploadIdentityKeySchema = z.object({
  identityPublicKey: z
    .string()
    .min(32, 'Identity public key must be at least 32 characters')
    .max(512, 'Identity public key must be at most 512 characters'),
});

// ─── Signed Pre-Key ──────────────────────────────────────────────────────────

export const uploadSignedPreKeySchema = z.object({
  keyId: z.number().int().positive(),
  publicKey: z
    .string()
    .min(32, 'Public key must be at least 32 characters')
    .max(512, 'Public key must be at most 512 characters'),
  signature: z
    .string()
    .min(32, 'Signature must be at least 32 characters')
    .max(1024, 'Signature must be at most 1024 characters'),
});

// ─── One-Time Pre-Keys ───────────────────────────────────────────────────────

const preKeyItemSchema = z.object({
  id: z.number().int().positive(),
  publicKey: z
    .string()
    .min(32, 'Public key must be at least 32 characters')
    .max(512, 'Public key must be at most 512 characters'),
});

export const uploadPreKeysSchema = z.object({
  preKeys: z
    .array(preKeyItemSchema)
    .min(1, 'At least one pre-key is required')
    .max(100, 'Maximum 100 pre-keys per upload'),
});

// ─── Pre-Key Bundle Params ───────────────────────────────────────────────────

export const getPreKeyBundleParamSchema = z.object({
  userId: z.string().uuid(),
});

// ─── Key Session ─────────────────────────────────────────────────────────────

export const recordKeySessionSchema = z.object({
  recipientId: z.string().uuid(),
  usedPreKeyId: z.number().int().positive().optional(),
  usedSignedPreKeyId: z.number().int().positive().optional(),
});

// ─── Signed Pre-Key Rotation ─────────────────────────────────────────────────

export const rotateSignedPreKeySchema = z.object({
  keyId: z.number().int().positive(),
  publicKey: z
    .string()
    .min(32, 'Public key must be at least 32 characters')
    .max(512, 'Public key must be at most 512 characters'),
  signature: z
    .string()
    .min(32, 'Signature must be at least 32 characters')
    .max(1024, 'Signature must be at most 1024 characters'),
});

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type UploadIdentityKeyInput = z.infer<typeof uploadIdentityKeySchema>;
export type UploadSignedPreKeyInput = z.infer<typeof uploadSignedPreKeySchema>;
export type UploadPreKeysInput = z.infer<typeof uploadPreKeysSchema>;
export type RecordKeySessionInput = z.infer<typeof recordKeySessionSchema>;
export type RotateSignedPreKeyInput = z.infer<typeof rotateSignedPreKeySchema>;
