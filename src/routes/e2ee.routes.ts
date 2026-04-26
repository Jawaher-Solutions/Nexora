// routes/e2ee.routes.ts
// E2EE key management routes — WhatsApp/Signal pre-key bundle model.
// Prefix: /api/v1/e2ee (set in routes/index.ts)
// All routes require authentication.

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import {
  uploadIdentityKey,
  uploadSignedPreKey,
  uploadPreKeys,
  getPreKeyBundle,
  recordKeySession,
  rotateSignedPreKey,
  getKeyStatus,
} from '../services/e2ee.service';
import {
  uploadIdentityKeySchema,
  uploadSignedPreKeySchema,
  uploadPreKeysSchema,
  getPreKeyBundleParamSchema,
  recordKeySessionSchema,
  rotateSignedPreKeySchema,
} from '../validators/e2ee.validators';
import { parseOrThrow } from '../utils/parseOrThrow';

export async function e2eeRoutes(app: FastifyInstance) {
  // ── Identity Key ────────────────────────────────────────────────────────────

  app.post(
    '/identity-key',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const body = parseOrThrow(uploadIdentityKeySchema, request.body);
      const result = await uploadIdentityKey(request.user.userId, body);
      return reply.code(201).send({ success: true, data: result });
    }
  );

  // ── Signed Pre-Key Upload ──────────────────────────────────────────────────

  app.post(
    '/signed-pre-key',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const body = parseOrThrow(uploadSignedPreKeySchema, request.body);
      const result = await uploadSignedPreKey(request.user.userId, body);
      return reply.code(200).send({ success: true, data: result });
    }
  );

  // ── Signed Pre-Key Rotation ────────────────────────────────────────────────

  app.put(
    '/signed-pre-key/rotate',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const body = parseOrThrow(rotateSignedPreKeySchema, request.body);
      const result = await rotateSignedPreKey(request.user.userId, body);
      return reply.code(200).send({ success: true, data: result });
    }
  );

  // ── One-Time Pre-Keys Upload ───────────────────────────────────────────────

  app.post(
    '/pre-keys',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const body = parseOrThrow(uploadPreKeysSchema, request.body);
      const result = await uploadPreKeys(request.user.userId, body);
      return reply.code(201).send({ success: true, data: result });
    }
  );

  // ── Pre-Key Bundle Retrieval ───────────────────────────────────────────────

  app.get(
    '/pre-key-bundle/:userId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const params = parseOrThrow(getPreKeyBundleParamSchema, request.params);
      const result = await getPreKeyBundle(request.user.userId, params.userId);
      return reply.code(200).send({ success: true, data: result });
    }
  );

  // ── Key Session Recording ─────────────────────────────────────────────────

  app.post(
    '/sessions',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const body = parseOrThrow(recordKeySessionSchema, request.body);
      const result = await recordKeySession(request.user.userId, body);
      return reply.code(201).send({ success: true, data: result });
    }
  );

  // ── Key Status ─────────────────────────────────────────────────────────────

  app.get(
    '/status',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const result = await getKeyStatus(request.user.userId);
      return reply.code(200).send({ success: true, data: result });
    }
  );
}
