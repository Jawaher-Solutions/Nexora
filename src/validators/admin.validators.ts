// validators/admin.validators.ts
// Zod schemas for Admin & Moderation API inputs.

import { z } from 'zod';

// ─── Review Video ─────────────────────────────────────────────────────────────

export const reviewVideoSchema = z.object({
  decision: z.enum(['approve', 'reject', 'restrict']),
  notes: z.string().max(1000, 'Notes must be 1000 chars or fewer').optional(),
});

export type ReviewVideoInput = z.infer<typeof reviewVideoSchema>;

// ─── Ban User ─────────────────────────────────────────────────────────────────

export const banUserSchema = z.object({
  reason: z
    .string()
    .min(5, 'Reason must be at least 5 characters')
    .max(500, 'Reason must be 500 chars or fewer'),
});

export type BanUserInput = z.infer<typeof banUserSchema>;

// ─── Admin Users Query ────────────────────────────────────────────────────────

export const adminUsersQuerySchema = z.object({
  page:     z.coerce.number().min(1).optional().default(1),
  limit:    z.coerce.number().min(1).max(100).optional().default(20),
  search:   z.string().optional(),
  isBanned: z.coerce.boolean().optional(),
  role:     z.enum(['USER', 'MODERATOR', 'ADMIN']).optional(),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

// ─── Admin Queue Query ────────────────────────────────────────────────────────

export const adminQueueQuerySchema = z.object({
  page:  z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(50).optional().default(20),
});

export type AdminQueueQuery = z.infer<typeof adminQueueQuerySchema>;

// ─── Moderation Logs Query ────────────────────────────────────────────────────

export const moderationLogsQuerySchema = z.object({
  page:        z.coerce.number().min(1).optional().default(1),
  limit:       z.coerce.number().min(1).max(100).optional().default(50),
  decision:    z
    .enum(['AUTO_APPROVED', 'AUTO_REJECTED', 'ESCALATED', 'HUMAN_APPROVED', 'HUMAN_REJECTED'])
    .optional(),
  startDate:   z
    .string()
    .datetime()
    .transform((val) => new Date(val))
    .optional(),
  endDate:     z
    .string()
    .datetime()
    .transform((val) => new Date(val))
    .optional(),
  videoId:     z.string().uuid().optional(),
  moderatorId: z.string().uuid().optional(),
});

export type ModerationLogsQuery = z.infer<typeof moderationLogsQuerySchema>;
