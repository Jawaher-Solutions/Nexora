import { faker } from '@faker-js/faker';
import { prisma } from '../../src/lib/prisma';
import { hashPassword } from '../../src/utils/hash';

export async function createTestUser(
  overrides: Partial<{
    username: string;
    email: string;
    password: string;
    role: 'USER' | 'MODERATOR' | 'ADMIN';
    isBanned: boolean;
  }> = {}
) {
  const password = overrides.password ?? 'Password123!';

  return prisma.user.create({
    data: {
      username: overrides.username ?? faker.internet.username().slice(0, 20).replace(/[^a-zA-Z0-9_]/g, '_'),
      email: overrides.email ?? faker.internet.email(),
      passwordHash: await hashPassword(password),
      publicKey: faker.string.alphanumeric(64),
      role: overrides.role ?? 'USER',
      isBanned: overrides.isBanned ?? false,
    },
  });
}

export async function createTestVideo(
  userId: string,
  overrides: Partial<{
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FLAGGED' | 'PENDING_REVIEW';
    type: 'SHORT' | 'LONG';
    likesCount: number;
    flagsCount: number;
  }> = {}
) {
  return prisma.video.create({
    data: {
      userId,
      title: faker.lorem.words(3),
      description: faker.lorem.sentence(),
      storageKey: `videos/${userId}/${faker.string.uuid()}.mp4`,
      durationSeconds: faker.number.int({ min: 10, max: 3600 }),
      type: overrides.type ?? 'SHORT',
      status: overrides.status ?? 'APPROVED',
      likesCount: overrides.likesCount ?? 0,
      flagsCount: overrides.flagsCount ?? 0,
    },
  });
}

export async function cleanTable(table: keyof typeof prisma) {
  const delegate = (prisma as any)[table];
  if (delegate && typeof delegate.deleteMany === 'function') {
    await delegate.deleteMany();
  }
}
