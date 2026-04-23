// middleware/role.middleware.ts
// RULE: Role-based access control guard.
// Must be used AFTER authenticate middleware.

import { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../utils/errors';

/**
 * Creates a preHandler that checks if the authenticated user has one of the allowed roles.
 * Usage: { preHandler: [authenticate, requireRole('ADMIN', 'MODERATOR')] }
 */
export function requireRole(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new ForbiddenError('Authentication required');
    }

    const user = request.user as { role: string };
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenError(
        `Role '${user.role}' does not have permission. Required: ${allowedRoles.join(', ')}`
      );
    }
  };
}
