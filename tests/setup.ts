import { config } from 'dotenv';
config({ path: '.env.test' });

import { vi } from 'vitest';

// Prevent real Redis connections during tests.
vi.mock('../src/lib/redis', () => ({
  redis: {
    quit: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    on: vi.fn(),
  },
}));

import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.moderationLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.flag.deleteMany();
  await prisma.like.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.video.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
  await redis.quit();
});
