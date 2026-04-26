// routes/social.routes.ts
// Social Layer routes: follows, comments, notifications.
// Prefix: /api/v1/social (set in routes/index.ts)
// All routes require authentication.

import { FastifyInstance } from 'fastify';
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
  commentIdParamSchema,
  paginationQuerySchema,
  notificationsQuerySchema,
} from '../validators/social.validators';
import { parseOrThrow } from '../utils/parseOrThrow';

export async function socialRoutes(app: FastifyInstance) {
  // ── Follow ───────────────────────────────────────────────────────────────

  app.post('/follow/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    const params = parseOrThrow(followParamSchema, request.params);
    const result = await followUser(request.user.userId, params.userId);
    return reply.code(200).send({ success: true, data: result });
  });

  app.delete('/follow/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    const params = parseOrThrow(followParamSchema, request.params);
    const result = await unfollowUser(request.user.userId, params.userId);
    return reply.code(200).send({ success: true, data: result });
  });

  // ── Followers / Following ─────────────────────────────────────────────────

  app.get('/followers/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    const params = parseOrThrow(followParamSchema, request.params);
    const query = parseOrThrow(paginationQuerySchema, request.query);
    const result = await getFollowers(params.userId, query.page, query.limit);
    return reply.code(200).send({ success: true, data: result });
  });

  app.get('/following/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    const params = parseOrThrow(followParamSchema, request.params);
    const query = parseOrThrow(paginationQuerySchema, request.query);
    const result = await getFollowing(params.userId, query.page, query.limit);
    return reply.code(200).send({ success: true, data: result });
  });

  // ── Comments ──────────────────────────────────────────────────────────────

  app.post('/comments', { preHandler: [authenticate] }, async (request, reply) => {
    const body = parseOrThrow(addCommentSchema, request.body);
    const result = await addComment(request.user.userId, body);
    return reply.code(201).send({ success: true, data: result });
  });

  app.get('/comments', { preHandler: [authenticate] }, async (request, reply) => {
    const query = parseOrThrow(getCommentsQuerySchema, request.query);
    const result = await getComments(query.videoId, query.page, query.limit);
    return reply.code(200).send({ success: true, data: result });
  });

  // Use generic commentIdParamSchema — not deletion-specific
  app.get('/comments/:commentId/replies', { preHandler: [authenticate] }, async (request, reply) => {
    const params = parseOrThrow(commentIdParamSchema, request.params);
    const query = parseOrThrow(paginationQuerySchema, request.query);
    const result = await getReplies(params.commentId, query.page, query.limit);
    return reply.code(200).send({ success: true, data: result });
  });

  app.delete('/comments/:commentId', { preHandler: [authenticate] }, async (request, reply) => {
    const params = parseOrThrow(commentIdParamSchema, request.params);
    const role = request.user.role as 'USER' | 'MODERATOR' | 'ADMIN';
    const result = await deleteComment(params.commentId, request.user.userId, role);
    return reply.code(200).send({ success: true, data: result });
  });

  // ── Notifications ─────────────────────────────────────────────────────────

  app.get('/notifications', { preHandler: [authenticate] }, async (request, reply) => {
    const query = parseOrThrow(notificationsQuerySchema, request.query);
    const result = await getNotifications(request.user.userId, query.page, query.limit);
    return reply.code(200).send({ success: true, data: result });
  });

  app.post('/notifications/read-all', { preHandler: [authenticate] }, async (request, reply) => {
    const result = await markNotificationsRead(request.user.userId);
    return reply.code(200).send({ success: true, data: result });
  });
}
