// validators/auth.validators.ts
// RULE: Pure Zod schemas only. No imports from services, lib, or routes.

import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/,
    'Username can only contain letters, numbers, and underscores'),
  email:    z.string().email('Must be a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  publicKey: z.string().min(1, 'Public key is required for E2EE'),
});

export const loginSchema = z.object({
  email:    z.string().email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().uuid('Invalid refresh token format'),
});

// Export inferred types
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
