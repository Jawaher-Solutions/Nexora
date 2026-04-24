import supertest, { SuperTest, Test } from 'supertest';

// Prevent starting background workers during E2E.
vi.mock('../../src/jobs', () => ({
  startWorkers: () => {},
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://mock-r2.com/signed'),
}));

const sendMock = vi.fn().mockResolvedValue({});
vi.mock('../../src/lib/r2', () => ({
  r2: {
    send: (...args: any[]) => sendMock(...args),
  },
}));

vi.mock('../../src/jobs/queues', () => ({
  addModerationJob: vi.fn().mockResolvedValue(undefined),
  moderationQueue: {},
}));

import { buildApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';

let app: Awaited<ReturnType<typeof buildApp>>;
let request: SuperTest<Test>;
let accessToken: string;
let userId: string;

describe('Video routes E2E', () => {
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    request = supertest(app.server);

    // register + login
    const register = await request.post('/api/v1/auth/register').send({
      username: 'user_1',
      email: 'user1@example.com',
      password: 'Password123!',
      publicKey: 'pk',
    });
    expect(register.status).toBe(201);

    const login = await request.post('/api/v1/auth/login').send({
      email: 'user1@example.com',
      password: 'Password123!',
    });
    expect(login.status).toBe(200);
    expect(login.body.data?.accessToken).toBeTruthy();

    accessToken = login.body.data.accessToken;

    const user = await prisma.user.findUnique({ where: { email: 'user1@example.com' } });
    if (!user) throw new Error('User not found after login');
    userId = user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    sendMock.mockClear();

    await prisma.moderationLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.flag.deleteMany();
    await prisma.like.deleteMany();
    await prisma.video.deleteMany();
  });

  it('POST /api/v1/videos/upload/request → 201 with uploadUrl', async () => {
    const res = await request
      .post('/api/v1/videos/upload/request')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'SHORT',
        durationSeconds: 10,
        contentType: 'video/mp4',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.uploadUrl).toContain('https://');
    expect(res.body.data.videoId).toBeTruthy();
  });

  it('POST /api/v1/videos/upload/request → 401 without token', async () => {
    const res = await request.post('/api/v1/videos/upload/request').send({
      type: 'SHORT',
      durationSeconds: 10,
      contentType: 'video/mp4',
    });

    expect(res.status).toBe(401);
  });

  it('POST /api/v1/videos/upload/request → 400 with invalid type', async () => {
    const res = await request
      .post('/api/v1/videos/upload/request')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'BAD',
        durationSeconds: 10,
        contentType: 'video/mp4',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/v1/videos/feed → 200 with pagination metadata', async () => {
    await prisma.video.create({
      data: {
        userId,
        storageKey: `videos/${userId}/a.mp4`,
        durationSeconds: 10,
        type: 'SHORT',
        status: 'APPROVED',
      },
    });

    const res = await request
      .get('/api/v1/videos/feed?page=1&limit=10')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pagination).toBeTruthy();
    expect(Array.isArray(res.body.data.videos)).toBe(true);
  });

  it('GET /api/v1/videos/feed → 401 without token', async () => {
    const res = await request.get('/api/v1/videos/feed');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/videos/:id → 200 for approved video', async () => {
    const video = await prisma.video.create({
      data: {
        userId,
        storageKey: `videos/${userId}/a.mp4`,
        durationSeconds: 10,
        type: 'SHORT',
        status: 'APPROVED',
      },
    });

    const res = await request
      .get(`/api/v1/videos/${video.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(video.id);
  });

  it('GET /api/v1/videos/:id → 404 for unknown id', async () => {
    const res = await request
      .get('/api/v1/videos/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /api/v1/videos/:id/like → 200 increments like', async () => {
    const video = await prisma.video.create({
      data: {
        userId,
        storageKey: `videos/${userId}/a.mp4`,
        durationSeconds: 10,
        type: 'SHORT',
        status: 'APPROVED',
      },
    });

    const res = await request
      .post(`/api/v1/videos/${video.id}/like`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(true);
  });

  it('POST /api/v1/videos/:id/like → 409 on double like', async () => {
    const video = await prisma.video.create({
      data: {
        userId,
        storageKey: `videos/${userId}/a.mp4`,
        durationSeconds: 10,
        type: 'SHORT',
        status: 'APPROVED',
      },
    });

    await request
      .post(`/api/v1/videos/${video.id}/like`)
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await request
      .post(`/api/v1/videos/${video.id}/like`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('DELETE /api/v1/videos/:id/like → 200', async () => {
    const video = await prisma.video.create({
      data: {
        userId,
        storageKey: `videos/${userId}/a.mp4`,
        durationSeconds: 10,
        type: 'SHORT',
        status: 'APPROVED',
      },
    });

    await request
      .post(`/api/v1/videos/${video.id}/like`)
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await request
      .delete(`/api/v1/videos/${video.id}/like`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(false);
  });

  it('POST /api/v1/videos/:id/flag → 200 with flagged:true', async () => {
    const video = await prisma.video.create({
      data: {
        userId,
        storageKey: `videos/${userId}/a.mp4`,
        durationSeconds: 10,
        type: 'SHORT',
        status: 'APPROVED',
      },
    });

    const res = await request
      .post(`/api/v1/videos/${video.id}/flag`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Spam content' });

    expect(res.status).toBe(200);
    expect(res.body.data.flagged).toBe(true);
  });

  it('DELETE /api/v1/videos/:id → 200 deletes own video', async () => {
    const video = await prisma.video.create({
      data: {
        userId,
        storageKey: `videos/${userId}/a.mp4`,
        durationSeconds: 10,
        type: 'SHORT',
        status: 'APPROVED',
      },
    });

    const res = await request
      .delete(`/api/v1/videos/${video.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });

  it('DELETE /api/v1/videos/:id → 404 deletes other user\'s video', async () => {
    const other = await prisma.user.create({
      data: {
        username: 'other_user',
        email: 'other@example.com',
        passwordHash: 'x',
        publicKey: 'pk',
      },
    });

    const video = await prisma.video.create({
      data: {
        userId: other.id,
        storageKey: `videos/${other.id}/a.mp4`,
        durationSeconds: 10,
        type: 'SHORT',
        status: 'APPROVED',
      },
    });

    const res = await request
      .delete(`/api/v1/videos/${video.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    // Service currently hides resource existence and throws NotFoundError.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
