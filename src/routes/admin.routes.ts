import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { ZodError } from 'zod';
import { requireRole } from '../middleware/role.middleware';
import * as adminService from '../services/admin.service';
import { ValidationError } from '../utils/errors';
import {
  adminQueueQuerySchema,
  reviewVideoSchema,
  adminUsersQuerySchema,
  banUserSchema,
  moderationLogsQuerySchema,
} from '../validators/admin.validators';

function toValidationError(error: unknown) {
  if (error instanceof ZodError) {
    throw new ValidationError(error.issues.map((i) => i.message).join(', '));
  }
  throw error;
}

const isModerator = requireRole('MODERATOR', 'ADMIN');
const isAdmin     = requireRole('ADMIN');

export async function adminRoutes(app: FastifyInstance) {
  // GET /queue
  app.get('/queue', { preHandler: [authenticate, isModerator] }, async (request, reply) => {
    try {
      const query = adminQueueQuerySchema.parse(request.query);
      const result = await adminService.getModerationQueue(query);
      return reply.send({ success: true, data: result });
    } catch (error: unknown) {
      toValidationError(error);
    }
  });

  // POST /queue/:videoId/review
  app.post<{ Params: { videoId: string } }>(
    '/queue/:videoId/review',
    { preHandler: [authenticate, isModerator] },
    async (request, reply) => {
      try {
        const body = reviewVideoSchema.parse(request.body);
        const result = await adminService.reviewVideo(request.params.videoId, request.user.userId, body);
        return reply.send({ success: true, data: result });
      } catch (error: unknown) {
        toValidationError(error);
      }
    }
  );

  // GET /users
  app.get('/users', { preHandler: [authenticate, isModerator] }, async (request, reply) => {
    try {
      const query = adminUsersQuerySchema.parse(request.query);
      const result = await adminService.getUsers(query);
      return reply.send({ success: true, data: result });
    } catch (error: unknown) {
      toValidationError(error);
    }
  });

  // GET /users/:userId
  app.get<{ Params: { userId: string } }>(
    '/users/:userId',
    { preHandler: [authenticate, isModerator] },
    async (request, reply) => {
      const result = await adminService.getUserById(request.params.userId);
      return reply.send({ success: true, data: result });
    }
  );

  // POST /users/:userId/ban
  app.post<{ Params: { userId: string } }>(
    '/users/:userId/ban',
    { preHandler: [authenticate, isAdmin] },
    async (request, reply) => {
      try {
        const body = banUserSchema.parse(request.body);
        const result = await adminService.banUser(request.params.userId, request.user.userId, body);
        return reply.send({ success: true, data: result });
      } catch (error: unknown) {
        toValidationError(error);
      }
    }
  );

  // POST /users/:userId/unban
  app.post<{ Params: { userId: string } }>(
    '/users/:userId/unban',
    { preHandler: [authenticate, isAdmin] },
    async (request, reply) => {
      const result = await adminService.unbanUser(request.params.userId);
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
    try {
      const query = moderationLogsQuerySchema.parse(request.query);
      const result = await adminService.getModerationLogs(query);
      return reply.send({ success: true, data: result });
    } catch (error: unknown) {
      toValidationError(error);
    }
  });
}
