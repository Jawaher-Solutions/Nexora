import { prisma } from '../../src/lib/prisma';
import * as adminService from '../../src/services/admin.service';
import { createTestUser, createTestVideo } from '../helpers/db';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../../src/utils/errors';

describe('admin.service integration', () => {
  beforeEach(async () => {
    await prisma.moderationLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.video.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('getModerationQueue', () => {
    it('returns paginated queue of PENDING_REVIEW videos', async () => {
      const owner = await createTestUser();
      await createTestVideo(owner.id, { status: 'PENDING_REVIEW' });
      await createTestVideo(owner.id, { status: 'PENDING_REVIEW' });
      await createTestVideo(owner.id, { status: 'APPROVED' });

      const result = await adminService.getModerationQueue({ page: 1, limit: 10 });
      expect(result.queue.length).toBe(2);
      expect(result.pagination.total).toBe(2);
      expect(result.queue[0].user.username).toBeTruthy();
    });
  });

  describe('reviewVideo', () => {
    it('approves a video, logs decision, and sends notification', async () => {
      const owner = await createTestUser();
      const mod = await createTestUser({ role: 'MODERATOR' });
      const video = await createTestVideo(owner.id, { status: 'PENDING_REVIEW' });

      const result = await adminService.reviewVideo(video.id, mod.id, { decision: 'approve', notes: 'Looks good' });
      expect(result.newStatus).toBe('APPROVED');
      expect(result.decision).toBe('HUMAN_APPROVED');

      const logs = await adminService.getModerationLogs({ page: 1, limit: 10 });
      expect(logs.logs.length).toBe(1);
      expect(logs.logs[0].decision).toBe('HUMAN_APPROVED');
      expect(logs.logs[0].humanNotes).toBe('Looks good');

      const notifs = await prisma.notification.findMany({ where: { userId: owner.id } });
      expect(notifs.length).toBe(1);
    });

    it('rejects a video and maps to correct status', async () => {
      const owner = await createTestUser();
      const mod = await createTestUser({ role: 'MODERATOR' });
      const video = await createTestVideo(owner.id, { status: 'PENDING_REVIEW' });

      const result = await adminService.reviewVideo(video.id, mod.id, { decision: 'reject' });
      expect(result.newStatus).toBe('REJECTED');
    });

    it('throws ValidationError if video is not PENDING_REVIEW', async () => {
      const owner = await createTestUser();
      const mod = await createTestUser({ role: 'MODERATOR' });
      const video = await createTestVideo(owner.id, { status: 'APPROVED' });

      await expect(adminService.reviewVideo(video.id, mod.id, { decision: 'approve' })).rejects.toThrow(ValidationError);
    });
  });

  describe('getUsers & getUserById', () => {
    it('gets users with search and pagination', async () => {
      await createTestUser({ username: 'alpha' });
      await createTestUser({ username: 'beta' });
      const result = await adminService.getUsers({ page: 1, limit: 10, search: 'alph' });
      expect(result.users.length).toBe(1);
      expect(result.users[0].username).toBe('alpha');
    });

    it('getUserById returns user profile stats', async () => {
      const target = await createTestUser();
      const user = await adminService.getUserById(target.id);
      expect(user.id).toBe(target.id);
      expect(user._count).toBeDefined();
    });

    it('throws NotFoundError for unknown user id', async () => {
      await expect(adminService.getUserById('00000000-0000-0000-0000-000000000000')).rejects.toThrow(NotFoundError);
    });
  });

  describe('banUser & unbanUser', () => {
    it('bans a user and sends notification', async () => {
      const target = await createTestUser();
      const admin = await createTestUser({ role: 'ADMIN' });

      await adminService.banUser(target.id, admin.id, { reason: 'spam' });
      const updated = await prisma.user.findUnique({ where: { id: target.id } });
      expect(updated?.isBanned).toBe(true);

      const notifs = await prisma.notification.findMany({ where: { userId: target.id } });
      expect(notifs[0].message).toContain('spam');
    });

    it('throws ForbiddenError when banning an admin', async () => {
      const target = await createTestUser({ role: 'ADMIN' });
      const admin = await createTestUser({ role: 'ADMIN' });

      await expect(adminService.banUser(target.id, admin.id, { reason: 'rule breaking' })).rejects.toThrow(ForbiddenError);
    });

    it('throws ConflictError if user is already banned', async () => {
      const target = await createTestUser({ isBanned: true });
      const admin = await createTestUser({ role: 'ADMIN' });

      await expect(adminService.banUser(target.id, admin.id, { reason: 'spam' })).rejects.toThrow(ConflictError);
    });

    it('unbans a user', async () => {
      const target = await createTestUser({ isBanned: true });
      await adminService.unbanUser(target.id);
      const updated = await prisma.user.findUnique({ where: { id: target.id } });
      expect(updated?.isBanned).toBe(false);
    });
  });

  describe('getAnalytics', () => {
    it('returns structured analytics', async () => {
      const u1 = await createTestUser();
      await createTestUser();
      await createTestVideo(u1.id, { status: 'PENDING_REVIEW' });
      await createTestVideo(u1.id, { status: 'APPROVED' });

      const stats = await adminService.getAnalytics();
      expect(stats.users.total).toBe(2);
      expect(stats.videos.total).toBe(2);
      expect(stats.videos.pendingReview).toBe(1);
      expect(stats.moderation.totalFlags).toBe(0);
    });
  });
});
