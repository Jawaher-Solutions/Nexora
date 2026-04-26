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
import { createTestUser, createTestVideo, cleanAll } from '../helpers/db';
import { generateTestToken } from '../helpers/auth';

// Duplicated mocks removed

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
    await cleanAll();
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

  it('prevents MODERATOR from accessing analytics', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const token = generateTestToken(mod.id, mod.role);
    const res = await request.get('/api/v1/admin/analytics').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows access for ADMIN to analytics', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const token = generateTestToken(admin.id, admin.role);
    const res = await request.get('/api/v1/admin/analytics').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.users).toBeDefined();
    expect(res.body.data.videos).toBeDefined();
  });

  it('gets the moderation queue', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const owner = await createTestUser();
    const video = await createTestVideo(owner.id, { status: 'PENDING_REVIEW' });

    const token = generateTestToken(mod.id, mod.role);
    const res = await request.get('/api/v1/admin/queue?page=1&limit=10').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.queue.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.queue.some((v: any) => v.id === video.id)).toBe(true);
  });

  it('reviews a video', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const owner = await createTestUser();
    const video = await createTestVideo(owner.id, { status: 'PENDING_REVIEW' });

    const token = generateTestToken(mod.id, mod.role);
    const res = await request
      .post(`/api/v1/admin/queue/${video.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'approve', notes: 'OK' });
    
    expect(res.status).toBe(200);
    expect(res.body.data.newStatus).toBe('APPROVED');
  });

  it('allows ADMIN to ban user', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const target = await createTestUser();
    const token = generateTestToken(admin.id, admin.role);

    const res = await request
      .post(`/api/v1/admin/users/${target.id}/ban`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'spamming videos' });
    
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(target.id);
  });

  it('allows ADMIN to unban user', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const target = await createTestUser({ isBanned: true });
    const token = generateTestToken(admin.id, admin.role);

    const res = await request
      .post(`/api/v1/admin/users/${target.id}/unban`)
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(target.id);
  });

  it('prevents MODERATOR from banning user', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const target = await createTestUser();
    const token = generateTestToken(mod.id, mod.role);

    const res = await request
      .post(`/api/v1/admin/users/${target.id}/ban`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'spamming videos' });
    
    expect(res.status).toBe(403);
  });

  it('MODERATOR can list users', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const target = await createTestUser({ username: 'johndoe' });
    const token = generateTestToken(mod.id, mod.role);

    const res = await request
      .get(`/api/v1/admin/users?search=john`)
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.users[0].username).toBe('johndoe');
  });

  it('MODERATOR can get moderation logs', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const owner = await createTestUser();
    const video = await createTestVideo(owner.id, { status: 'PENDING_REVIEW' });
    
    const token = generateTestToken(mod.id, mod.role);
    
    // Create a log by reviewing
    const reviewRes = await request
      .post(`/api/v1/admin/queue/${video.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'approve' });
    
    expect(reviewRes.status).toBe(200);

    const res = await request
      .get(`/api/v1/admin/logs?decision=HUMAN_APPROVED`)
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.data.logs.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.logs[0].decision).toBe('HUMAN_APPROVED');
  });
});
