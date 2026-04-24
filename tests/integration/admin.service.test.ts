import { prisma } from '../../src/lib/prisma';
import * as adminService from '../../src/services/admin.service';
import { createTestUser, createTestVideo } from '../helpers/db';
import { NotFoundError, ForbiddenError } from '../../src/utils/errors';

describe('admin.service integration', () => {
  beforeEach(async () => {
    await prisma.moderationLog.deleteMany();
    await prisma.video.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it('gets the moderation queue', async () => {
    const owner = await createTestUser();
    await createTestVideo(owner.id, { status: 'PENDING_REVIEW', flagsCount: 10 });
    await createTestVideo(owner.id, { status: 'PENDING_REVIEW', flagsCount: 20 });
    await createTestVideo(owner.id, { status: 'APPROVED' });

    const result = await adminService.getModerationQueue(1, 10);
    expect(result.videos.length).toBe(2);
    // Highest flags first
    expect(result.videos[0].flagsCount).toBe(20);
    expect(result.pagination.total).toBe(2);
  });

  it('reviews a video and logs decision', async () => {
    const owner = await createTestUser();
    const mod = await createTestUser({ role: 'MODERATOR' });
    const video = await createTestVideo(owner.id, { status: 'PENDING_REVIEW' });

    const updated = await adminService.reviewVideo(video.id, mod.id, 'APPROVE', 'Looks good');
    expect(updated.status).toBe('APPROVED');

    const logs = await adminService.getModerationLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].decision).toBe('HUMAN_APPROVED');
    expect(logs[0].humanNotes).toBe('Looks good');
  });

  it('rejects a video and logs decision', async () => {
    const owner = await createTestUser();
    const mod = await createTestUser({ role: 'MODERATOR' });
    const video = await createTestVideo(owner.id, { status: 'PENDING_REVIEW' });

    const updated = await adminService.reviewVideo(video.id, mod.id, 'REJECT');
    expect(updated.status).toBe('REJECTED');

    const logs = await adminService.getModerationLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].decision).toBe('HUMAN_REJECTED');
  });

  it('throws NotFoundError when reviewing unknown video', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    await expect(adminService.reviewVideo('fake', mod.id, 'APPROVE')).rejects.toThrow(NotFoundError);
  });

  it('bans a user', async () => {
    const target = await createTestUser();
    const admin = await createTestUser({ role: 'ADMIN' });

    await adminService.banUser(target.id, admin.id);
    const updated = await prisma.user.findUnique({ where: { id: target.id } });
    expect(updated?.isBanned).toBe(true);
  });

  it('throws ForbiddenError when trying to ban an admin', async () => {
    const target = await createTestUser({ role: 'ADMIN' });
    const admin = await createTestUser({ role: 'ADMIN' });

    await expect(adminService.banUser(target.id, admin.id)).rejects.toThrow(ForbiddenError);
  });

  it('throws NotFoundError when banning unknown user', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    await expect(adminService.banUser('fake', admin.id)).rejects.toThrow(NotFoundError);
  });

  it('gets analytics', async () => {
    const u1 = await createTestUser();
    await createTestUser();
    await createTestVideo(u1.id, { status: 'PENDING_REVIEW' });
    await createTestVideo(u1.id, { status: 'APPROVED' });

    const stats = await adminService.getAnalytics();
    expect(stats.totalUsers).toBe(2);
    expect(stats.totalVideos).toBe(2);
    expect(stats.pendingReviews).toBe(1);
  });
});
