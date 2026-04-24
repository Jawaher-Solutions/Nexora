import supertest from 'supertest';

// Prevent starting background workers during E2E.
vi.mock('../../src/jobs', () => ({
  startWorkers: () => {},
}));

import { buildApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';

let app: Awaited<ReturnType<typeof buildApp>>;
let request: supertest.SuperTest<supertest.Test>;

describe('POST /api/v1/auth/* (E2E)', () => {
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    request = supertest(app.server);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it('POST /register → 201 with user and tokens', async () => {
    const res = await request.post('/api/v1/auth/register').send({
      username: 'user_1',
      email: 'user1@example.com',
      password: 'Password123!',
      publicKey: 'pk',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user.email).toBe('user1@example.com');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('POST /register → 409 for duplicate email', async () => {
    await request.post('/api/v1/auth/register').send({
      username: 'user_1',
      email: 'dup@example.com',
      password: 'Password123!',
      publicKey: 'pk',
    });

    const res = await request.post('/api/v1/auth/register').send({
      username: 'user_2',
      email: 'dup@example.com',
      password: 'Password123!',
      publicKey: 'pk',
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('POST /register → 400 for invalid body', async () => {
    const res = await request.post('/api/v1/auth/register').send({
      email: 'bad',
      password: 'short',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /login → 200 with tokens', async () => {
    await request.post('/api/v1/auth/register').send({
      username: 'user_1',
      email: 'user1@example.com',
      password: 'Password123!',
      publicKey: 'pk',
    });

    const res = await request.post('/api/v1/auth/login').send({
      email: 'user1@example.com',
      password: 'Password123!',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
  });

  it('POST /login → 401 for wrong password', async () => {
    await request.post('/api/v1/auth/register').send({
      username: 'user_1',
      email: 'user1@example.com',
      password: 'Password123!',
      publicKey: 'pk',
    });

    const res = await request.post('/api/v1/auth/login').send({
      email: 'user1@example.com',
      password: 'WrongPassword!',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /refresh → 200 with new tokens', async () => {
    await request.post('/api/v1/auth/register').send({
      username: 'user_1',
      email: 'user1@example.com',
      password: 'Password123!',
      publicKey: 'pk',
    });

    const login = await request.post('/api/v1/auth/login').send({
      email: 'user1@example.com',
      password: 'Password123!',
    });

    const refreshToken = login.body.data.refreshToken;

    const res = await request.post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
  });

  it('POST /logout → 200', async () => {
    await request.post('/api/v1/auth/register').send({
      username: 'user_1',
      email: 'user1@example.com',
      password: 'Password123!',
      publicKey: 'pk',
    });

    const login = await request.post('/api/v1/auth/login').send({
      email: 'user1@example.com',
      password: 'Password123!',
    });

    const accessToken = login.body.data.accessToken;
    const refreshToken = login.body.data.refreshToken;

    const res = await request
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
