// routes/message.routes.ts
// E2EE Messaging routes.
// Prefix: /api/v1/messages (set in routes/index.ts)
// All routes require authentication.

import { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import {
  getRecipientPublicKey,
  sendMessage,
  getConversationList,
  getConversation,
} from '../services/message.service';
import {
  sendMessageSchema,
  getConversationQuerySchema,
} from '../validators/social.validators';
import { ValidationError } from '../utils/errors';

function toValidationError(error: unknown): ValidationError {
  if (error instanceof ZodError) {
    return new ValidationError(error.issues.map((issue) => issue.message).join(', '));
  }
  return new ValidationError('Invalid request data');
}

export async function messageRoutes(app: FastifyInstance) {
  // ── Public Key ────────────────────────────────────────────────────────────
  // Client calls this BEFORE sending a message to get the recipient's
  // public key for client-side encryption.

  app.get('/public-key/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    const params = request.params as { userId: string };
    const result = await getRecipientPublicKey(request.user.userId, params.userId);
    return reply.code(200).send({ success: true, data: result });
  });

  // ── Send Message ──────────────────────────────────────────────────────────

  app.post('/send', { preHandler: [authenticate] }, async (request, reply) => {
    let body;
    try {
      body = sendMessageSchema.parse(request.body);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await sendMessage(request.user.userId, body);
    return reply.code(201).send({ success: true, data: result });
  });

  // ── Conversation List ─────────────────────────────────────────────────────

  app.get('/conversations', { preHandler: [authenticate] }, async (request, reply) => {
    const result = await getConversationList(request.user.userId);
    return reply.code(200).send({ success: true, data: result });
  });

  // ── Single Conversation ───────────────────────────────────────────────────

  app.get('/conversations/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    const params = request.params as { userId: string };
    let query;
    try {
      query = getConversationQuerySchema.parse(request.query);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await getConversation(
      request.user.userId,
      params.userId,
      query.page,
      query.limit
    );
    return reply.code(200).send({ success: true, data: result });
  });
}
