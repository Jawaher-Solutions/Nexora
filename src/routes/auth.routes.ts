// routes/auth.routes.ts
// RULE: HTTP concerns only. No business logic or DB queries.

import { FastifyInstance } from 'fastify';
import { registerSchema, loginSchema, refreshSchema } from '../validators/auth.validators';
import * as authService from '../services/auth.service';
import { authenticate } from '../middleware/auth.middleware';
import { ValidationError } from '../utils/errors';

export async function authRoutes(app: FastifyInstance) {

  // POST /api/v1/auth/register
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((e: any) => e.message).join(', '));
    }

    const result = await authService.registerUser(parsed.data);
    const accessToken = app.jwt.sign(result.tokens.accessTokenPayload, { expiresIn: '15m' });

    return reply.code(201).send({
      success: true,
      data: {
        user: result.user,
        accessToken,
        refreshToken: result.tokens.refreshToken,
      },
    });
  });

  // POST /api/v1/auth/login
  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((e: any) => e.message).join(', '));
    }

    const result = await authService.loginUser(parsed.data);
    const accessToken = app.jwt.sign(result.tokens.accessTokenPayload, { expiresIn: '15m' });

    return reply.code(200).send({
      success: true,
      data: {
        user: result.user,
        accessToken,
        refreshToken: result.tokens.refreshToken,
      },
    });
  });

  // POST /api/v1/auth/refresh
  app.post('/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((e: any) => e.message).join(', '));
    }

    const tokens = await authService.refreshAccessToken(parsed.data.refreshToken);
    const accessToken = app.jwt.sign(tokens.accessTokenPayload, { expiresIn: '15m' });

    return reply.code(200).send({
      success: true,
      data: {
        accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  });

  // POST /api/v1/auth/logout (requires authentication)
  app.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };
    const user = request.user as { userId: string };
    const result = await authService.logoutUser(user.userId, refreshToken);

    return reply.code(200).send({
      success: true,
      data: result,
    });
  });
}
