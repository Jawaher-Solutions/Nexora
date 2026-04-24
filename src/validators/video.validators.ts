import { z } from 'zod';

export const requestUploadSchema = z.object({
  title: z.string().max(255).optional(),
  description: z.string().optional(),
  type: z.enum(['SHORT', 'LONG']),
  durationSeconds: z.number().int().min(1),
  contentType: z.string().regex(/^video\//, 'contentType must start with video/'),
});

export const confirmUploadSchema = z.object({
  videoId: z.string().uuid(),
});

export const feedQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
});

export const flagVideoSchema = z.object({
  reason: z.string().min(5).max(500),
});

export type RequestUploadInput = z.infer<typeof requestUploadSchema>;
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
export type FeedQuery = z.infer<typeof feedQuerySchema>;
export type FlagVideoInput = z.infer<typeof flagVideoSchema>;
