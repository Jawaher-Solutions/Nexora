// Middleware to enforce roles
import { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../utils/errors';

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const role = request.user?.role;
    if (!roles.includes(role)) {
      throw new ForbiddenError('Insufficient role permissions');
    }
  };    
} 