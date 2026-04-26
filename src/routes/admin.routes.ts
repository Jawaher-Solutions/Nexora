import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { ZodError } from 'zod';
import { requireRole } from '../middleware/role.middleware';
import * as adminService from '../services/admin.service';
import { ValidationError } from '../utils/errors';
import { parseOrThrow } from '../utils/parseOrThrow';
import { userIdParamSchema } from '../validators/social.validators';
import {
  adminQueueQuerySchema,
  reviewVideoSchema,
  adminUsersQuerySchema,
  banUserSchema,
  moderationLogsQuerySchema,
  videoIdParamSchema,
} from '../validators/admin.validators';

const isModerator = requireRole('MODERATOR', 'ADMIN');
const isAdmin     = requireRole('ADMIN');

export async function adminRoutes(app: FastifyInstance) {
  // GET /queue
  app.get('/queue', { preHandler: [authenticate, isModerator] }, async (request, reply) => {
    const query = parseOrThrow(adminQueueQuerySchema, request.query);
    const result = await adminService.getModerationQueue(query);
    return reply.send({ success: true, data: result });
  });

  // POST /queue/:videoId/review
  app.post<{ Params: { videoId: string } }>(
    '/queue/:videoId/review',
    { preHandler: [authenticate, isModerator] },
    async (request, reply) => {
      const { videoId } = parseOrThrow(videoIdParamSchema, request.params);
      const body = parseOrThrow(reviewVideoSchema, request.body);
      const result = await adminService.reviewVideo(videoId, request.user.userId, body);
      return reply.send({ success: true, data: result });
    }
  );

  // GET /users
  app.get('/users', { preHandler: [authenticate, isModerator] }, async (request, reply) => {
    const query = parseOrThrow(adminUsersQuerySchema, request.query);
    const result = await adminService.getUsers(query);
    return reply.send({ success: true, data: result });
  });

  // GET /users/:userId
  app.get<{ Params: { userId: string } }>(
    '/users/:userId',
    { preHandler: [authenticate, isModerator] },
    async (request, reply) => {
      const { userId } = parseOrThrow(userIdParamSchema, request.params);
      const result = await adminService.getUserById(userId);
      return reply.send({ success: true, data: result });
    }
  );

  // POST /users/:userId/ban
  app.post<{ Params: { userId: string } }>(
    '/users/:userId/ban',
    { preHandler: [authenticate, isAdmin] },
    async (request, reply) => {
      const { userId } = parseOrThrow(userIdParamSchema, request.params);
      const body = parseOrThrow(banUserSchema, request.body);
      const result = await adminService.banUser(userId, request.user.userId, body);
      return reply.send({ success: true, data: result });
    }
  );

  // POST /users/:userId/unban
  app.post<{ Params: { userId: string } }>(
    '/users/:userId/unban',
    { preHandler: [authenticate, isAdmin] },
    async (request, reply) => {
      const { userId } = parseOrThrow(userIdParamSchema, request.params);
      const result = await adminService.unbanUser(userId);
      return reply.send({ success: true, data: result });
    }
  );

  // GET /analytics
  app.get('/analytics', { preHandler: [authenticate, isAdmin] }, async (request, reply) => {
    const result = await adminService.getAnalytics();
    return reply.send({ success: true, data: result });
  });

  // GET /logs
  app.get('/logs', { preHandler: [authenticate, isModerator] }, async (request, reply) => {
    const query = parseOrThrow(moderationLogsQuerySchema, request.query);
    const result = await adminService.getModerationLogs(query);
    return reply.send({ success: true, data: result });
  });
}
