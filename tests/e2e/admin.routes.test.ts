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

import supertest from 'supertest';
import { prisma } from '../../src/lib/prisma';
import { buildApp } from '../../src/app';
import { createTestUser, createTestVideo } from '../helpers/db';
import { generateTestToken } from '../helpers/auth';

describe('Admin routes E2E', () => {
  let app: any;
  let request: any;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    request = supertest(app.server);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.moderationLog.deleteMany();
    await prisma.video.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it('rejects unauthenticated requests to analytics', async () => {
    const res = await request.get('/api/v1/admin/analytics');
    expect(res.status).toBe(401);
  });

  it('rejects access for normal users', async () => {
    const user = await createTestUser({ role: 'USER' });
    const token = generateTestToken(user.id, user.role);
    const res = await request.get('/api/v1/admin/analytics').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows access for MODERATOR to analytics', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const token = generateTestToken(mod.id, mod.role);
    const res = await request.get('/api/v1/admin/analytics').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('totalUsers');
  });

  it('allows access for ADMIN to analytics', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const token = generateTestToken(admin.id, admin.role);
    const res = await request.get('/api/v1/admin/analytics').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('totalUsers');
  });

  it('gets the moderation queue', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const owner = await createTestUser();
    const video = await createTestVideo(owner.id, { status: 'PENDING_REVIEW' });

    const token = generateTestToken(mod.id, mod.role);
    const res = await request.get('/api/v1/admin/queue').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.videos.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.videos.some((v: any) => v.id === video.id)).toBe(true);
  });

  it('reviews a video', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const owner = await createTestUser();
    const video = await createTestVideo(owner.id, { status: 'PENDING_REVIEW' });

    const token = generateTestToken(mod.id, mod.role);
    const res = await request
      .post(`/api/v1/admin/videos/${video.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'APPROVE', notes: 'OK' });
    
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('allows ADMIN to ban user', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const target = await createTestUser();
    const token = generateTestToken(admin.id, admin.role);

    const res = await request
      .post(`/api/v1/admin/users/${target.id}/ban`)
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.data.isBanned).toBe(true);
  });

  it('prevents MODERATOR from banning user', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const target = await createTestUser();
    const token = generateTestToken(mod.id, mod.role);

    const res = await request
      .post(`/api/v1/admin/users/${target.id}/ban`)
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(403);
  });
});
