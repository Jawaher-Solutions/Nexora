import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as adminService from '../services/admin.service';
import { authenticate } from '../middleware/auth.middleware';
import { ForbiddenError, ValidationError } from '../utils/errors';
import { requireRole } from '../middleware/role.middleware';

const reviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().optional(),
});

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    await requireRole('MODERATOR', 'ADMIN')(request, reply);
  });

  app.get('/queue', async (request: FastifyRequest, reply: FastifyReply) => {
    const querySchema = z.object({
      page: z.string().optional().transform(v => Math.max(parseInt(v || '1', 10) || 1, 1))
    });
    const { page } = querySchema.parse(request.query);
    const result = await adminService.getModerationQueue(page);
    return reply.send({ data: result });
  });

  app.post('/videos/:id/review', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const { id } = paramsSchema.parse(request.params);
    let body;
    try {
      body = reviewSchema.parse(request.body);
    } catch (error: any) {
      throw new ValidationError(error.issues?.[0]?.message || 'Invalid data');
    }
    const result = await adminService.reviewVideo(id, request.user.userId, body.decision, body.notes);
    return reply.send({ data: result });
  });

  app.post('/users/:id/ban', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const { id } = paramsSchema.parse(request.params);
    await requireRole('ADMIN')(request, reply);
    const result = await adminService.banUser(id, request.user.userId);
    return reply.send({ data: result });
  });

  app.get('/analytics', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await adminService.getAnalytics();
    return reply.send({ data: result });
  });
}
