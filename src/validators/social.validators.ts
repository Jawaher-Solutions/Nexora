// validators/social.validators.ts
// Zod schemas for social (follow, comment, notification) and E2EE messaging inputs.

import { z } from 'zod';

// ─── Follow ─────────────────────────────────────────────────────────────────

export const followParamSchema = z.object({
  userId: z.string().uuid(),
});

// ─── Comments ────────────────────────────────────────────────────────────────

export const addCommentSchema = z.object({
  videoId: z.string().uuid(),
  content: z.string().trim().min(1, 'Content is required').max(1000, 'Content must be 1000 chars or fewer'),
  parentId: z.string().uuid().optional(),
});

export const getCommentsQuerySchema = z.object({
  videoId: z.string().uuid(),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(50).optional().default(20),
});

export const deleteCommentParamSchema = z.object({
  commentId: z.string().uuid(),
});

// ─── Notifications ───────────────────────────────────────────────────────────

export const notificationsQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(50).optional().default(20),
});

// ─── Messages ────────────────────────────────────────────────────────────────

export const sendMessageSchema = z.object({
  recipientId: z.string().uuid(),
  // Opaque ciphertext — validate length only, never inspect content
  encryptedContent: z.string().min(1, 'encryptedContent is required').max(65535, 'encryptedContent exceeds maximum length'),
});

export const getConversationQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
});

// ─── Inferred types ──────────────────────────────────────────────────────────

export type AddCommentInput = z.infer<typeof addCommentSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
