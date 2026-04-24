import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as adminService from '../services/admin.service';
import { authenticate } from '../middleware/auth.middleware';
import { ForbiddenError, ValidationError } from '../utils/errors';

const reviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().optional(),
});

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const role = request.user?.role;
    if (role !== 'MODERATOR' && role !== 'ADMIN') {
      throw new ForbiddenError('Admin or Moderator role required');
    }
  });

  app.get('/queue', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as any;
    const page = query.page ? parseInt(query.page) : 1;
    const result = await adminService.getModerationQueue(page);
    return reply.send({ data: result });
  });

  app.post('/videos/:id/review', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as any;
    let body;
    try {
      body = reviewSchema.parse(request.body);
    } catch (error: any) {
      throw new ValidationError(error.errors?.[0]?.message || 'Invalid data');
    }
    const result = await adminService.reviewVideo(id, request.user.userId, body.decision, body.notes);
    return reply.send({ data: result });
  });

  app.post('/users/:id/ban', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as any;
    const role = request.user?.role;
    if (role !== 'ADMIN') {
      throw new ForbiddenError('Admin role required to ban users');
    }
    const result = await adminService.banUser(id, request.user.userId);
    return reply.send({ data: result });
  });

  app.get('/analytics', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await adminService.getAnalytics();
    return reply.send({ data: result });
  });
}
