import { config } from 'dotenv';
config({ path: '.env.test' });

import { vi } from 'vitest';

// Prevent real Redis connections during tests.
vi.mock('../src/lib/redis', () => {
  const mockRedis = {
    quit: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    xadd: vi.fn(),
  };

  const handler = {
    get: (target: any, prop: string) => {
      if (prop in target) return target[prop];
      return vi.fn().mockImplementation(() => {
        throw new Error(`Redis method "${prop}" is not mocked in tests/setup.ts`);
      });
    },
  };

  return { redis: new Proxy(mockRedis, handler) };
});

import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  try {
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
  } finally {
    await prisma.$disconnect();
    await redis.quit();
  }
});
