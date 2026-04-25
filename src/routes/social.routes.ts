// routes/social.routes.ts
// Social Layer routes: follows, comments, notifications.
// Prefix: /api/v1/social (set in routes/index.ts)
// All routes require authentication.

import { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  addComment,
  getComments,
  getReplies,
  deleteComment,
  getNotifications,
  markNotificationsRead,
} from '../services/social.service';
import {
  followParamSchema,
  addCommentSchema,
  getCommentsQuerySchema,
  deleteCommentParamSchema,
  notificationsQuerySchema,
} from '../validators/social.validators';
import { ValidationError } from '../utils/errors';

function toValidationError(error: unknown): ValidationError {
  if (error instanceof ZodError) {
    return new ValidationError(error.issues.map((issue) => issue.message).join(', '));
  }
  return new ValidationError('Invalid request data');
}

export async function socialRoutes(app: FastifyInstance) {
  // ── Follow ───────────────────────────────────────────────────────────────

  app.post('/follow/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    let params;
    try {
      params = followParamSchema.parse(request.params);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await followUser(request.user.userId, params.userId);
    return reply.code(200).send({ success: true, data: result });
  });

  app.delete('/follow/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    let params;
    try {
      params = followParamSchema.parse(request.params);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await unfollowUser(request.user.userId, params.userId);
    return reply.code(200).send({ success: true, data: result });
  });

  // ── Followers / Following ─────────────────────────────────────────────────

  app.get('/followers/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    let params;
    let query;
    try {
      params = followParamSchema.parse(request.params);
      query = notificationsQuerySchema.parse(request.query);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await getFollowers(params.userId, query.page, query.limit);
    return reply.code(200).send({ success: true, data: result });
  });

  app.get('/following/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    let params;
    let query;
    try {
      params = followParamSchema.parse(request.params);
      query = notificationsQuerySchema.parse(request.query);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await getFollowing(params.userId, query.page, query.limit);
    return reply.code(200).send({ success: true, data: result });
  });

  // ── Comments ──────────────────────────────────────────────────────────────

  app.post('/comments', { preHandler: [authenticate] }, async (request, reply) => {
    let body;
    try {
      body = addCommentSchema.parse(request.body);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await addComment(request.user.userId, body);
    return reply.code(201).send({ success: true, data: result });
  });

  app.get('/comments', { preHandler: [authenticate] }, async (request, reply) => {
    let query;
    try {
      query = getCommentsQuerySchema.parse(request.query);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await getComments(query.videoId, query.page, query.limit);
    return reply.code(200).send({ success: true, data: result });
  });

  app.get('/comments/:commentId/replies', { preHandler: [authenticate] }, async (request, reply) => {
    let params;
    let query;
    try {
      params = deleteCommentParamSchema.parse(request.params);
      query = notificationsQuerySchema.parse(request.query);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await getReplies(params.commentId, query.page, query.limit);
    return reply.code(200).send({ success: true, data: result });
  });

  app.delete('/comments/:commentId', { preHandler: [authenticate] }, async (request, reply) => {
    let params;
    try {
      params = deleteCommentParamSchema.parse(request.params);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await deleteComment(params.commentId, request.user.userId, request.user.role);
    return reply.code(200).send({ success: true, data: result });
  });

  // ── Notifications ─────────────────────────────────────────────────────────

  app.get('/notifications', { preHandler: [authenticate] }, async (request, reply) => {
    let query;
    try {
      query = notificationsQuerySchema.parse(request.query);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await getNotifications(request.user.userId, query.page, query.limit);
    return reply.code(200).send({ success: true, data: result });
  });

  app.post('/notifications/read-all', { preHandler: [authenticate] }, async (request, reply) => {
    const result = await markNotificationsRead(request.user.userId);
    return reply.code(200).send({ success: true, data: result });
  });
}
