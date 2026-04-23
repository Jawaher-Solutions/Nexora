// middleware/auth.middleware.ts
// RULE: This middleware verifies JWT and attaches user to request.
// It does NOT query the database directly — uses JWT payload only.

import { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../utils/errors';

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const decoded = await request.jwtVerify<{ userId: string; role: string }>();
    request.user = {
      userId: decoded.userId,
      role: decoded.role,
    };
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}
