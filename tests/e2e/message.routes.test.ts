
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

// Shared users created once per suite
let senderToken: string;
let senderId: string;
let recipientToken: string;
let recipientId: string;

async function registerAndLogin(suffix: string) {
  const reg = await request.post('/api/v1/auth/register').send({
    username: `msg_user_${suffix}`,
    email: `msg_${suffix}@example.com`,
    password: 'Password123!',
    publicKey: `pk_${suffix}`,
  });
  expect(reg.status).toBe(201);

  const login = await request.post('/api/v1/auth/login').send({
    email: `msg_${suffix}@example.com`,
    password: 'Password123!',
  });
  expect(login.status).toBe(200);

  const user = await prisma.user.findUnique({ where: { email: `msg_${suffix}@example.com` } });
  return { token: login.body.data.accessToken as string, userId: user!.id };
}

describe('Message routes E2E (/api/v1/messages)', () => {
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    request = supertest(app.server);

    const s = await registerAndLogin('sender');
    senderToken = s.token;
    senderId = s.userId;

    const r = await registerAndLogin('recipient');
    recipientToken = r.token;
    recipientId = r.userId;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean messages only — preserve users and tokens
    await prisma.message.deleteMany();
  });

  // ─── 401 guard ───────────────────────────────────────────────────────────────

  it('returns 401 on all protected routes when no token is provided', async () => {
    const routes = [
      () => request.get(`/api/v1/messages/public-key/${recipientId}`),
      () => request.post('/api/v1/messages/send'),
      () => request.get('/api/v1/messages/conversations'),
      () => request.get(`/api/v1/messages/conversations/${recipientId}`),
    ];

    for (const route of routes) {
      // No token
      const noToken = await route();
      expect(noToken.status).toBe(401);

      // Invalid / malformed token
      const badToken = await route().set('Authorization', 'Bearer garbage-token');
      expect(badToken.status).toBe(401);
    }
  });

  // ─── GET /public-key/:userId ──────────────────────────────────────────────────

  describe('GET /public-key/:userId', () => {
    it('200 → returns public key, userId, and username', async () => {
      const res = await request
        .get(`/api/v1/messages/public-key/${recipientId}`)
        .set('Authorization', `Bearer ${senderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe(recipientId);
      expect(res.body.data.publicKey).toBeTruthy();
      expect(res.body.data.username).toBeTruthy();
    });

    it('404 → recipient does not exist', async () => {
      const res = await request
        .get('/api/v1/messages/public-key/00000000-0000-4000-8000-000000000099')
        .set('Authorization', `Bearer ${senderToken}`);

      expect(res.status).toBe(404);
    });

    it('does not expose passwordHash', async () => {
      const res = await request
        .get(`/api/v1/messages/public-key/${recipientId}`)
        .set('Authorization', `Bearer ${senderToken}`);

      expect(res.body.data.passwordHash).toBeUndefined();
    });
  });

  // ─── POST /send ───────────────────────────────────────────────────────────────

  describe('POST /send', () => {
    it('201 → creates a message and returns messageId + createdAt', async () => {
      const res = await request
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientId, encryptedContent: 'cipher-text' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.messageId).toBeTruthy();
      expect(res.body.data.createdAt).toBeTruthy();
    });

    it('does NOT return encryptedContent in the response', async () => {
      const res = await request
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientId, encryptedContent: 'secret' });

      expect(res.body.data.encryptedContent).toBeUndefined();
    });

    it('400 → rejects empty encryptedContent', async () => {
      const res = await request
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientId, encryptedContent: '' });

      expect(res.status).toBe(400);
    });

    it('400 → rejects non-UUID recipientId', async () => {
      const res = await request
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientId: 'not-a-uuid', encryptedContent: 'cipher' });

      expect(res.status).toBe(400);
    });

    it('400 → messaging yourself', async () => {
      const res = await request
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientId: senderId, encryptedContent: 'self-message' });

      expect(res.status).toBe(400);
    });

    it('404 → recipient does not exist', async () => {
      const res = await request
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({
          recipientId: '00000000-0000-4000-8000-000000000099',
          encryptedContent: 'cipher',
        });

      expect(res.status).toBe(404);
    });
  });

  // ─── GET /conversations ───────────────────────────────────────────────────────

  describe('GET /conversations', () => {
    it('200 → returns empty list when no messages', async () => {
      const res = await request
        .get('/api/v1/messages/conversations')
        .set('Authorization', `Bearer ${senderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.conversations).toEqual([]);
    });

    it('200 → returns conversation list after sending a message', async () => {
      await request
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientId, encryptedContent: 'hello!' });

      const res = await request
        .get('/api/v1/messages/conversations')
        .set('Authorization', `Bearer ${senderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.conversations.length).toBe(1);
      expect(res.body.data.conversations[0].user.id).toBe(recipientId);
      expect(res.body.data.conversations[0].lastMessage.isMine).toBe(true);
    });

    it('shows isMine=false when last message was received', async () => {
      await request
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${recipientToken}`)
        .send({ recipientId: senderId, encryptedContent: 'reply' });

      const res = await request
        .get('/api/v1/messages/conversations')
        .set('Authorization', `Bearer ${senderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.conversations[0].lastMessage.isMine).toBe(false);
    });
  });

  // ─── GET /conversations/:userId ───────────────────────────────────────────────

  describe('GET /conversations/:userId', () => {
    it('200 → returns paginated message history', async () => {
      await request
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientId, encryptedContent: 'msg-1' });

      await request
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${recipientToken}`)
        .send({ recipientId: senderId, encryptedContent: 'msg-2' });

      const res = await request
        .get(`/api/v1/messages/conversations/${recipientId}`)
        .set('Authorization', `Bearer ${senderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.messages.length).toBe(2);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.total).toBe(2);
    });

    it('200 → returns messages in ascending (chronological) order', async () => {
      await request
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientId, encryptedContent: 'first' });

      await new Promise(resolve => setTimeout(resolve, 50));

      await request
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientId, encryptedContent: 'second' });

      await new Promise(resolve => setTimeout(resolve, 50));

      await request
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientId, encryptedContent: 'third' });

      const res = await request
        .get(`/api/v1/messages/conversations/${recipientId}?limit=10`)
        .set('Authorization', `Bearer ${senderToken}`);

      expect(res.status).toBe(200);
      const times = res.body.data.messages.map((m: { createdAt: string }) =>
        new Date(m.createdAt).getTime()
      );
      expect(times.length).toBe(3);
      expect(times[0]).toBeLessThan(times[1]);
      expect(times[1]).toBeLessThan(times[2]);
    });

    it('200 → empty conversation with a user who has no messages', async () => {
      const res = await request
        .get(`/api/v1/messages/conversations/${recipientId}`)
        .set('Authorization', `Bearer ${senderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.messages).toEqual([]);
    });

    it('404 → other user does not exist', async () => {
      const res = await request
        .get('/api/v1/messages/conversations/00000000-0000-4000-8000-000000000099')
        .set('Authorization', `Bearer ${senderToken}`);

      expect(res.status).toBe(404);
    });

    it('400 → invalid page param', async () => {
      const res = await request
        .get(`/api/v1/messages/conversations/${recipientId}?page=0`)
        .set('Authorization', `Bearer ${senderToken}`);

      expect(res.status).toBe(400);
    });

    it('400 → malformed UUID in path param returns 400', async () => {
      const res = await request
        .get('/api/v1/messages/conversations/not-a-uuid')
        .set('Authorization', `Bearer ${senderToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /public-key/:userId — UUID validation', () => {
    it('400 → malformed userId returns 400', async () => {
      const res = await request
        .get('/api/v1/messages/public-key/not-a-uuid')
        .set('Authorization', `Bearer ${senderToken}`);

      expect(res.status).toBe(400);
    });
  });
});
