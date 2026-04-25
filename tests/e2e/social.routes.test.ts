import supertest from 'supertest';

// Prevent starting background workers during E2E.
vi.mock('../../src/jobs', () => ({
  startWorkers: () => {},
}));

vi.mock('../../src/jobs/queues', () => ({
  addModerationJob: vi.fn().mockResolvedValue(undefined),
  moderationQueue: {},
}));

import { buildApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';

let app: Awaited<ReturnType<typeof buildApp>>;
let request: ReturnType<typeof supertest>;
let accessToken: string;
let userId: string;

// ─── Helper: register + login ─────────────────────────────────────────────────

async function registerAndLogin(suffix: string) {
  const registerRes = await request.post('/api/v1/auth/register').send({
    username: `user_${suffix}`,
    email: `user_${suffix}@example.com`,
    password: 'Password123!',
    publicKey: `pk_${suffix}`,
  });
  expect(registerRes.status).toBe(201);

  const loginRes = await request.post('/api/v1/auth/login').send({
    email: `user_${suffix}@example.com`,
    password: 'Password123!',
  });
  expect(loginRes.status).toBe(200);

  const user = await prisma.user.findUnique({ where: { email: `user_${suffix}@example.com` } });
  return { token: loginRes.body.data.accessToken as string, userId: user!.id };
}

describe('Social routes E2E (/api/v1/social)', () => {
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    request = supertest(app.server);

    const main = await registerAndLogin('social_main');
    accessToken = main.token;
    userId = main.userId;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.follow.deleteMany();
    await prisma.message.deleteMany();
    await prisma.video.deleteMany();
    // Keep the main user; only delete extras
    await prisma.user.deleteMany({ where: { id: { not: userId } } });
  });

  // ─── 401 guard ───────────────────────────────────────────────────────────────

  it('returns 401 on all protected routes when no token is provided', async () => {
    const routes = [
      () => request.post('/api/v1/social/follow/00000000-0000-0000-0000-000000000001'),
      () => request.delete('/api/v1/social/follow/00000000-0000-0000-0000-000000000001'),
      () => request.get('/api/v1/social/followers/00000000-0000-0000-0000-000000000001'),
      () => request.get('/api/v1/social/following/00000000-0000-0000-0000-000000000001'),
      () => request.post('/api/v1/social/comments'),
      () => request.get('/api/v1/social/comments?videoId=00000000-0000-0000-0000-000000000001'),
      () => request.get('/api/v1/social/notifications'),
      () => request.post('/api/v1/social/notifications/read-all'),
    ];

    for (const route of routes) {
      const res = await route();
      expect(res.status).toBe(401);
    }
  });

  // ─── Follow / Unfollow ────────────────────────────────────────────────────────

  describe('POST /follow/:userId', () => {
    it('201 → follows another user', async () => {
      const other = await registerAndLogin('social_other1');

      const res = await request
        .post(`/api/v1/social/follow/${other.userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.following).toBe(true);
    });

    it('409 → double follow returns conflict', async () => {
      const other = await registerAndLogin('social_other2');

      await request
        .post(`/api/v1/social/follow/${other.userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      const res = await request
        .post(`/api/v1/social/follow/${other.userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(409);
    });

    it('400 → invalid UUID param', async () => {
      const res = await request
        .post('/api/v1/social/follow/not-a-uuid')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
    });

    it('400 → following yourself', async () => {
      const res = await request
        .post(`/api/v1/social/follow/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /follow/:userId', () => {
    it('200 → unfollows successfully', async () => {
      const other = await registerAndLogin('social_unfollow1');

      await request
        .post(`/api/v1/social/follow/${other.userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      const res = await request
        .delete(`/api/v1/social/follow/${other.userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.following).toBe(false);
    });

    it('200 → idempotent unfollow (not following)', async () => {
      const other = await registerAndLogin('social_unfollow2');

      const res = await request
        .delete(`/api/v1/social/follow/${other.userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.following).toBe(false);
    });
  });

  // ─── Followers / Following ────────────────────────────────────────────────────

  describe('GET /followers/:userId', () => {
    it('200 → returns followers list with pagination', async () => {
      const other = await registerAndLogin('social_followertest');

      await request
        .post(`/api/v1/social/follow/${userId}`)
        .set('Authorization', `Bearer ${other.token}`);

      const res = await request
        .get(`/api/v1/social/followers/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.followers)).toBe(true);
      expect(res.body.data.followers.length).toBe(1);
      expect(res.body.data.pagination).toBeDefined();
    });

    it('200 → returns empty followers list', async () => {
      const res = await request
        .get(`/api/v1/social/followers/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.followers).toEqual([]);
    });
  });

  describe('GET /following/:userId', () => {
    it('200 → returns following list with pagination', async () => {
      const other = await registerAndLogin('social_followingtest');

      await request
        .post(`/api/v1/social/follow/${other.userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      const res = await request
        .get(`/api/v1/social/following/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.following.length).toBe(1);
    });
  });

  // ─── Comments ─────────────────────────────────────────────────────────────────

  describe('POST /comments', () => {
    it('201 → creates a comment on an approved video', async () => {
      const video = await prisma.video.create({
        data: {
          userId,
          storageKey: `videos/${userId}/test.mp4`,
          durationSeconds: 10,
          type: 'SHORT',
          status: 'APPROVED',
        },
      });

      const res = await request
        .post('/api/v1/social/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ videoId: video.id, content: 'Great video!' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.content).toBe('Great video!');
      expect(res.body.data.user).toBeDefined();
    });

    it('400 → rejects empty content', async () => {
      const video = await prisma.video.create({
        data: {
          userId,
          storageKey: `videos/${userId}/test2.mp4`,
          durationSeconds: 10,
          type: 'SHORT',
          status: 'APPROVED',
        },
      });

      const res = await request
        .post('/api/v1/social/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ videoId: video.id, content: '' });

      expect(res.status).toBe(400);
    });

    it('400 → rejects missing videoId', async () => {
      const res = await request
        .post('/api/v1/social/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ content: 'Nice' });

      expect(res.status).toBe(400);
    });

    it('404 → video not found', async () => {
      const res = await request
        .post('/api/v1/social/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ videoId: '00000000-0000-0000-0000-000000000099', content: 'Hi' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /comments', () => {
    it('200 → returns top-level comments with reply counts', async () => {
      const video = await prisma.video.create({
        data: {
          userId,
          storageKey: `videos/${userId}/test3.mp4`,
          durationSeconds: 10,
          type: 'SHORT',
          status: 'APPROVED',
        },
      });

      await request
        .post('/api/v1/social/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ videoId: video.id, content: 'Top comment' });

      const res = await request
        .get(`/api/v1/social/comments?videoId=${video.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.comments)).toBe(true);
      expect(res.body.data.comments.length).toBe(1);
    });

    it('400 → missing videoId query param', async () => {
      const res = await request
        .get('/api/v1/social/comments')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /comments/:commentId/replies', () => {
    it('200 → returns replies for a comment', async () => {
      const video = await prisma.video.create({
        data: {
          userId,
          storageKey: `videos/${userId}/test4.mp4`,
          durationSeconds: 10,
          type: 'SHORT',
          status: 'APPROVED',
        },
      });

      const parentRes = await request
        .post('/api/v1/social/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ videoId: video.id, content: 'Parent comment' });

      const parentId = parentRes.body.data.id;

      await request
        .post('/api/v1/social/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ videoId: video.id, content: 'Reply', parentId });

      const res = await request
        .get(`/api/v1/social/comments/${parentId}/replies`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.replies.length).toBe(1);
    });

    it('404 → comment not found', async () => {
      const res = await request
        .get('/api/v1/social/comments/00000000-0000-0000-0000-000000000099/replies')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /comments/:commentId', () => {
    it('200 → deletes own comment', async () => {
      const video = await prisma.video.create({
        data: {
          userId,
          storageKey: `videos/${userId}/test5.mp4`,
          durationSeconds: 10,
          type: 'SHORT',
          status: 'APPROVED',
        },
      });

      const commentRes = await request
        .post('/api/v1/social/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ videoId: video.id, content: 'To delete' });

      const commentId = commentRes.body.data.id;

      const res = await request
        .delete(`/api/v1/social/comments/${commentId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
    });

    it('403 → cannot delete another user\'s comment', async () => {
      const other = await registerAndLogin('social_delother');
      const video = await prisma.video.create({
        data: {
          userId: other.userId,
          storageKey: `videos/${other.userId}/test6.mp4`,
          durationSeconds: 10,
          type: 'SHORT',
          status: 'APPROVED',
        },
      });

      const commentRes = await request
        .post('/api/v1/social/comments')
        .set('Authorization', `Bearer ${other.token}`)
        .send({ videoId: video.id, content: 'Other user comment' });

      const commentId = commentRes.body.data.id;

      const res = await request
        .delete(`/api/v1/social/comments/${commentId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ─── Notifications ────────────────────────────────────────────────────────────

  describe('GET /notifications', () => {
    it('200 → returns notifications list with unreadCount', async () => {
      const other = await registerAndLogin('social_notiftest');

      await request
        .post(`/api/v1/social/follow/${userId}`)
        .set('Authorization', `Bearer ${other.token}`);

      const res = await request
        .get('/api/v1/social/notifications')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.notifications)).toBe(true);
      expect(res.body.data.unreadCount).toBeGreaterThan(0);
    });
  });

  describe('POST /notifications/read-all', () => {
    it('200 → marks all notifications as read', async () => {
      const other = await registerAndLogin('social_readall');

      await request
        .post(`/api/v1/social/follow/${userId}`)
        .set('Authorization', `Bearer ${other.token}`);

      const res = await request
        .post('/api/v1/social/notifications/read-all')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);

      // Verify unread count is now 0
      const checkRes = await request
        .get('/api/v1/social/notifications')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(checkRes.body.data.unreadCount).toBe(0);
    });
  });
});
