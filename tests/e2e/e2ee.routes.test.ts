
import supertest from 'supertest';

// Prevent starting background workers during E2E.
vi.mock('../../src/jobs', () => ({
  startWorkers: () => {},
}));

vi.mock('../../src/jobs/moderation.worker', () => ({
  moderationWorker: { on: vi.fn() },
}));

vi.mock('../../src/jobs/queues', () => ({
  addModerationJob: vi.fn().mockResolvedValue(undefined),
  moderationQueue: {},
}));

import { buildApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';

let app: Awaited<ReturnType<typeof buildApp>>;
let request: ReturnType<typeof supertest>;

let userAToken: string;
let userAId: string;
let userBToken: string;
let userBId: string;

const KEY = 'a'.repeat(44);
const SIG = 'b'.repeat(88);

async function registerAndLogin(suffix: string) {
  const reg = await request.post('/api/v1/auth/register').send({
    username: `e2ee_${suffix}`,
    email: `e2ee_${suffix}@example.com`,
    password: 'Password123!',
    publicKey: `pk_${suffix}_${'x'.repeat(30)}`,
  });
  expect(reg.status).toBe(201);

  const login = await request.post('/api/v1/auth/login').send({
    email: `e2ee_${suffix}@example.com`,
    password: 'Password123!',
  });
  expect(login.status).toBe(200);

  const user = await prisma.user.findUnique({
    where: { email: `e2ee_${suffix}@example.com` },
  });
  return { token: login.body.data.accessToken as string, userId: user!.id };
}

describe('E2EE routes E2E (/api/v1/e2ee)', () => {
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    request = supertest(app.server);

    const a = await registerAndLogin('alice');
    userAToken = a.token;
    userAId = a.userId;

    const b = await registerAndLogin('bob');
    userBToken = b.token;
    userBId = b.userId;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean E2EE-specific data, preserve users and tokens
    await prisma.keySession.deleteMany();
    await prisma.signedPreKeyHistory.deleteMany();
    await prisma.preKey.deleteMany();
    await prisma.user.updateMany({
      data: {
        signedPreKeyId: null,
        signedPreKeyPublic: null,
        signedPreKeySignature: null,
        signedPreKeyCreatedAt: null,
        preKeysCount: 0,
      },
    });
  });

  // ─── 401 guard ─────────────────────────────────────────────────────────────

  it('returns 401 on all E2EE routes when no token provided', async () => {
    const routes = [
      () => request.post('/api/v1/e2ee/identity-key'),
      () => request.post('/api/v1/e2ee/signed-pre-key'),
      () => request.put('/api/v1/e2ee/signed-pre-key/rotate'),
      () => request.post('/api/v1/e2ee/pre-keys'),
      () => request.get(`/api/v1/e2ee/pre-key-bundle/${userBId}`),
      () => request.post('/api/v1/e2ee/sessions'),
      () => request.get('/api/v1/e2ee/status'),
    ];

    for (const route of routes) {
      const res = await route();
      expect(res.status).toBe(401);
    }
  });

  // ─── POST /identity-key ────────────────────────────────────────────────────

  describe('POST /identity-key', () => {
    it('409 → identity key already set (from registration)', async () => {
      const res = await request
        .post('/api/v1/e2ee/identity-key')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ identityPublicKey: KEY });

      expect(res.status).toBe(409);
    });

    it('201 → registers identity key when not set', async () => {
      await prisma.user.update({
        where: { id: userAId },
        data: { publicKey: '' },
      });

      const res = await request
        .post('/api/v1/e2ee/identity-key')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ identityPublicKey: KEY });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.success).toBe(true);
    });

    it('400 → rejects short identity key', async () => {
      const res = await request
        .post('/api/v1/e2ee/identity-key')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ identityPublicKey: 'short' });

      expect(res.status).toBe(400);
    });
  });

  // ─── POST /signed-pre-key ─────────────────────────────────────────────────

  describe('POST /signed-pre-key', () => {
    it('200 → uploads a signed pre-key', async () => {
      const res = await request
        .post('/api/v1/e2ee/signed-pre-key')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ keyId: 1, publicKey: KEY, signature: SIG });

      expect(res.status).toBe(200);
      expect(res.body.data.keyId).toBe(1);
    });

    it('409 → duplicate keyId', async () => {
      await request
        .post('/api/v1/e2ee/signed-pre-key')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ keyId: 1, publicKey: KEY, signature: SIG });

      const res = await request
        .post('/api/v1/e2ee/signed-pre-key')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ keyId: 1, publicKey: 'x'.repeat(44), signature: 'y'.repeat(88) });

      expect(res.status).toBe(409);
    });

    it('400 → rejects non-positive keyId', async () => {
      const res = await request
        .post('/api/v1/e2ee/signed-pre-key')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ keyId: 0, publicKey: KEY, signature: SIG });

      expect(res.status).toBe(400);
    });
  });

  // ─── PUT /signed-pre-key/rotate ────────────────────────────────────────────

  describe('PUT /signed-pre-key/rotate', () => {
    it('200 → rotates signed pre-key', async () => {
      await request
        .post('/api/v1/e2ee/signed-pre-key')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ keyId: 1, publicKey: KEY, signature: SIG });

      const res = await request
        .put('/api/v1/e2ee/signed-pre-key/rotate')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ keyId: 2, publicKey: 'c'.repeat(44), signature: 'd'.repeat(88) });

      expect(res.status).toBe(200);
      expect(res.body.data.newKeyId).toBe(2);
      expect(res.body.data.rotatedAt).toBeTruthy();
    });

    it('409 → same keyId', async () => {
      await request
        .post('/api/v1/e2ee/signed-pre-key')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ keyId: 1, publicKey: KEY, signature: SIG });

      const res = await request
        .put('/api/v1/e2ee/signed-pre-key/rotate')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ keyId: 1, publicKey: 'x'.repeat(44), signature: 'y'.repeat(88) });

      expect(res.status).toBe(409);
    });
  });

  // ─── POST /pre-keys ────────────────────────────────────────────────────────

  describe('POST /pre-keys', () => {
    it('201 → uploads batch of pre-keys', async () => {
      const res = await request
        .post('/api/v1/e2ee/pre-keys')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          preKeys: [
            { id: 1, publicKey: KEY },
            { id: 2, publicKey: KEY },
            { id: 3, publicKey: KEY },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.uploaded).toBe(3);
      expect(res.body.data.remaining).toBe(3);
    });

    it('400 → duplicate IDs in batch', async () => {
      const res = await request
        .post('/api/v1/e2ee/pre-keys')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ preKeys: [{ id: 1, publicKey: KEY }, { id: 1, publicKey: KEY }] });

      expect(res.status).toBe(400);
    });

    it('400 → empty array', async () => {
      const res = await request
        .post('/api/v1/e2ee/pre-keys')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ preKeys: [] });

      expect(res.status).toBe(400);
    });

    it('409 → pre-key IDs already exist', async () => {
      await request
        .post('/api/v1/e2ee/pre-keys')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ preKeys: [{ id: 1, publicKey: KEY }] });

      const res = await request
        .post('/api/v1/e2ee/pre-keys')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ preKeys: [{ id: 1, publicKey: 'x'.repeat(44) }] });

      expect(res.status).toBe(409);
    });
  });

  // ─── GET /pre-key-bundle/:userId ───────────────────────────────────────────

  describe('GET /pre-key-bundle/:userId', () => {
    it('200 → returns full PFS bundle', async () => {
      // Set up Bob's keys
      await request
        .post('/api/v1/e2ee/signed-pre-key')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ keyId: 1, publicKey: KEY, signature: SIG });

      await request
        .post('/api/v1/e2ee/pre-keys')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ preKeys: [{ id: 10, publicKey: KEY }, { id: 20, publicKey: KEY }] });

      // Alice fetches Bob's bundle
      const res = await request
        .get(`/api/v1/e2ee/pre-key-bundle/${userBId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.identityKey).toBeTruthy();
      expect(res.body.data.signedPreKey.keyId).toBe(1);
      expect(res.body.data.oneTimePreKey).not.toBeNull();
      expect(res.body.data.oneTimePreKey.keyId).toBe(10);
      expect(res.body.data.recipientId).toBe(userBId);
    });

    it('400 → cannot fetch own bundle', async () => {
      const res = await request
        .get(`/api/v1/e2ee/pre-key-bundle/${userAId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(400);
    });

    it('400 → invalid UUID param', async () => {
      const res = await request
        .get('/api/v1/e2ee/pre-key-bundle/not-a-uuid')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(400);
    });

    it('400 → target has no signed pre-key', async () => {
      const res = await request
        .get(`/api/v1/e2ee/pre-key-bundle/${userBId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(400);
    });

    it('404 → target does not exist', async () => {
      const res = await request
        .get('/api/v1/e2ee/pre-key-bundle/00000000-0000-4000-8000-000000000099')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── POST /sessions ────────────────────────────────────────────────────────

  describe('POST /sessions', () => {
    it('201 → records a key session', async () => {
      const res = await request
        .post('/api/v1/e2ee/sessions')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ recipientId: userBId, usedPreKeyId: 10, usedSignedPreKeyId: 1 });

      expect(res.status).toBe(201);
      expect(res.body.data.sessionId).toBeTruthy();
    });

    it('400 → self-session', async () => {
      const res = await request
        .post('/api/v1/e2ee/sessions')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ recipientId: userAId });

      expect(res.status).toBe(400);
    });

    it('400 → invalid recipientId', async () => {
      const res = await request
        .post('/api/v1/e2ee/sessions')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ recipientId: 'not-a-uuid' });

      expect(res.status).toBe(400);
    });

    it('404 → non-existent recipient', async () => {
      const res = await request
        .post('/api/v1/e2ee/sessions')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ recipientId: '00000000-0000-4000-8000-000000000099' });

      expect(res.status).toBe(404);
    });
  });

  // ─── GET /status ───────────────────────────────────────────────────────────

  describe('GET /status', () => {
    it('200 → returns key status', async () => {
      const res = await request
        .get('/api/v1/e2ee/status')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasIdentityKey).toBe(true);
      expect(res.body.data.hasSignedPreKey).toBe(false);
      expect(res.body.data.oneTimePreKeysCount).toBe(0);
      expect(res.body.data.needsPreKeyUpload).toBe(true);
    });

    it('200 → reflects uploaded keys in status', async () => {
      await request
        .post('/api/v1/e2ee/signed-pre-key')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ keyId: 1, publicKey: KEY, signature: SIG });

      await request
        .post('/api/v1/e2ee/pre-keys')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          preKeys: Array.from({ length: 15 }, (_, i) => ({
            id: i + 1,
            publicKey: KEY,
          })),
        });

      const res = await request
        .get('/api/v1/e2ee/status')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.hasSignedPreKey).toBe(true);
      expect(res.body.data.oneTimePreKeysCount).toBe(15);
      expect(res.body.data.needsPreKeyUpload).toBe(false);
      expect(res.body.data.signedPreKeyId).toBe(1);
    });
  });
});
