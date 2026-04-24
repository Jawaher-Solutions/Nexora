import { Prisma } from '@prisma/client';
import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../../src/lib/prisma';
import * as videoService from '../../src/services/video.service';
import { createTestUser, createTestVideo } from '../helpers/db';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../src/utils/errors';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://mock-r2.com/signed'),
}));

const sendMock = vi.fn();
vi.mock('../../src/lib/r2', () => ({
  r2: {
    send: (...args: any[]) => sendMock(...args),
  },
}));

const addModerationJobMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/jobs/queues', () => ({
  addModerationJob: (...args: any[]) => addModerationJobMock(...args),
  moderationQueue: {},
}));

describe('video.service integration', () => {
  beforeEach(async () => {
    sendMock.mockReset();
    addModerationJobMock.mockClear();

    await prisma.moderationLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.flag.deleteMany();
    await prisma.like.deleteMany();
    await prisma.video.deleteMany();
    await prisma.follow.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('requestUpload', () => {
    it('returns videoId, uploadUrl, and storageKey', async () => {
      const user = await createTestUser();

      const result = await videoService.requestUpload(user.id, {
        title: 't',
        description: 'd',
        type: 'SHORT',
        durationSeconds: 10,
        contentType: 'video/mp4',
      });

      expect(result.videoId).toBeTruthy();
      expect(result.uploadUrl).toContain('https://');
      expect(result.storageKey).toContain(`videos/${user.id}/`);
    });

    it('creates a Video record in DB with PENDING status', async () => {
      const user = await createTestUser();

      const result = await videoService.requestUpload(user.id, {
        title: 't',
        description: 'd',
        type: 'SHORT',
        durationSeconds: 10,
        contentType: 'video/mp4',
      });

      const video = await prisma.video.findUnique({ where: { id: result.videoId } });
      expect(video?.status).toBe('PENDING');
    });

    it('storageKey follows pattern videos/{userId}/{uuid}.mp4', async () => {
      const user = await createTestUser();

      const result = await videoService.requestUpload(user.id, {
        type: 'SHORT',
        durationSeconds: 10,
        contentType: 'video/mp4',
      });

      expect(result.storageKey).toMatch(new RegExp(`^videos/${user.id}/.+\\.mp4$`));
    });
  });

  describe('confirmUpload', () => {
    it('calls addModerationJob with videoId', async () => {
      const user = await createTestUser();
      const video = await createTestVideo(user.id, { status: 'PENDING' });

      sendMock.mockResolvedValueOnce({});

      await videoService.confirmUpload(video.id, user.id);

      expect(addModerationJobMock).toHaveBeenCalledTimes(1);
      expect(addModerationJobMock).toHaveBeenCalledWith(video.id);
    });

    it('throws NotFoundError if video belongs to different user', async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();
      const video = await createTestVideo(userA.id, { status: 'PENDING' });

      await expect(videoService.confirmUpload(video.id, userB.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ValidationError if file not in R2', async () => {
      const user = await createTestUser();
      const video = await createTestVideo(user.id, { status: 'PENDING' });

      sendMock.mockRejectedValueOnce(new Error('NotFound'));

      await expect(videoService.confirmUpload(video.id, user.id)).rejects.toBeInstanceOf(ValidationError);
    });

    it('sends a HeadObjectCommand for the correct storage key', async () => {
      const user = await createTestUser();
      const video = await createTestVideo(user.id, { status: 'PENDING' });

      sendMock.mockResolvedValueOnce({});

      await videoService.confirmUpload(video.id, user.id);

      const [cmd] = sendMock.mock.calls[0];
      expect(cmd).toBeInstanceOf(HeadObjectCommand);
      expect((cmd as any).input.Key).toBe(video.storageKey);
    });
  });

  describe('getVideoById', () => {
    it('returns APPROVED video to any user', async () => {
      const owner = await createTestUser();
      const viewer = await createTestUser();
      const video = await createTestVideo(owner.id, { status: 'APPROVED' });

      const result = await videoService.getVideoById(video.id, viewer.id);
      expect(result.id).toBe(video.id);
      expect(result.streamUrl).toContain('https://');
    });

    it('returns own PENDING video to owner', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id, { status: 'PENDING' });

      const result = await videoService.getVideoById(video.id, owner.id);
      expect(result.id).toBe(video.id);
      expect(result.status).toBe('PENDING');
    });

    it('throws ForbiddenError for PENDING video accessed by non-owner', async () => {
      const owner = await createTestUser();
      const viewer = await createTestUser();
      const video = await createTestVideo(owner.id, { status: 'PENDING' });

      await expect(videoService.getVideoById(video.id, viewer.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws NotFoundError for unknown videoId', async () => {
      const user = await createTestUser();
      await expect(videoService.getVideoById('00000000-0000-0000-0000-000000000000', user.id)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });

  describe('likeVideo / unlikeVideo', () => {
    it('likeVideo increments likesCount by 1', async () => {
      const user = await createTestUser();
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id, { status: 'APPROVED', likesCount: 0 });

      const result = await videoService.likeVideo(user.id, video.id);
      expect(result.liked).toBe(true);
      expect(result.likesCount).toBe(1);
    });

    it('likeVideo twice throws ConflictError', async () => {
      const user = await createTestUser();
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id, { status: 'APPROVED' });

      await videoService.likeVideo(user.id, video.id);
      await expect(videoService.likeVideo(user.id, video.id)).rejects.toBeInstanceOf(ConflictError);
    });

    it('unlikeVideo decrements likesCount', async () => {
      const user = await createTestUser();
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id, { status: 'APPROVED' });

      await videoService.likeVideo(user.id, video.id);
      await videoService.unlikeVideo(user.id, video.id);

      const refreshed = await prisma.video.findUnique({ where: { id: video.id } });
      expect(refreshed?.likesCount).toBe(0);
    });

    it('unlikeVideo on non-liked video throws NotFoundError', async () => {
      const user = await createTestUser();
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id, { status: 'APPROVED' });

      await expect(videoService.unlikeVideo(user.id, video.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('flagVideo', () => {
    it('creates a Flag record and increments flagsCount', async () => {
      const user = await createTestUser();
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id, { status: 'APPROVED', flagsCount: 0 });

      const result = await videoService.flagVideo(user.id, video.id, 'Spam content');
      expect(result.flagged).toBe(true);
      expect(result.flagsCount).toBe(1);

      const flags = await prisma.flag.findMany({ where: { videoId: video.id } });
      expect(flags.length).toBe(1);
    });

    it('escalates to PENDING_REVIEW when flags exceed 50% of likes and likesCount > 10', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id, { status: 'APPROVED', likesCount: 20, flagsCount: 0 });

      const flaggers = await Promise.all(Array.from({ length: 11 }).map(() => createTestUser()));

      for (const u of flaggers) {
        await videoService.flagVideo(u.id, video.id, 'Inappropriate');
      }

      const updated = await prisma.video.findUnique({ where: { id: video.id } });
      expect(updated?.status).toBe('PENDING_REVIEW');
      expect(addModerationJobMock).toHaveBeenCalled();
    });

    it('does NOT escalate when likesCount is <= 10', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id, { status: 'APPROVED', likesCount: 5, flagsCount: 0 });

      const flaggers = await Promise.all(Array.from({ length: 3 }).map(() => createTestUser()));

      for (const u of flaggers) {
        await videoService.flagVideo(u.id, video.id, 'Inappropriate');
      }

      const updated = await prisma.video.findUnique({ where: { id: video.id } });
      expect(updated?.status).toBe('APPROVED');
    });
  });

  describe('deleteVideo', () => {
    it('removes video from DB', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id);

      sendMock.mockResolvedValueOnce({});

      await videoService.deleteVideo(video.id, owner.id);

      const inDb = await prisma.video.findUnique({ where: { id: video.id } });
      expect(inDb).toBeNull();
    });

    it('calls deleteObject with correct storageKey', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id);

      sendMock.mockResolvedValueOnce({});

      await videoService.deleteVideo(video.id, owner.id);

      const [cmd] = sendMock.mock.calls[0];
      expect(cmd).toBeInstanceOf(DeleteObjectCommand);
      expect((cmd as any).input.Key).toBe(video.storageKey);
    });

    it('throws NotFoundError if video belongs to different user', async () => {
      const owner = await createTestUser();
      const other = await createTestUser();
      const video = await createTestVideo(owner.id);

      await expect(videoService.deleteVideo(video.id, other.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getFeed', () => {
    it('returns only APPROVED videos from followed users and self', async () => {
      const user = await createTestUser();
      const followed = await createTestUser();
      const notFollowed = await createTestUser();

      await prisma.follow.create({ data: { followerId: user.id, followeeId: followed.id } });

      const v1 = await createTestVideo(user.id, { status: 'APPROVED' });
      const v2 = await createTestVideo(followed.id, { status: 'APPROVED' });
      await createTestVideo(notFollowed.id, { status: 'APPROVED' });
      await createTestVideo(followed.id, { status: 'REJECTED' });

      const result = await videoService.getFeed(user.id, 1, 50);
      const ids = result.videos.map((v) => v.id);

      expect(ids).toContain(v1.id);
      expect(ids).toContain(v2.id);
      expect(ids.length).toBe(2);
    });

    it('paginates correctly with page and limit', async () => {
      const user = await createTestUser();

      for (let i = 0; i < 5; i++) {
        await createTestVideo(user.id, { status: 'APPROVED' });
      }

      const page1 = await videoService.getFeed(user.id, 1, 2);
      const page2 = await videoService.getFeed(user.id, 2, 2);

      expect(page1.videos.length).toBe(2);
      expect(page2.videos.length).toBe(2);
      expect(page1.pagination.total).toBe(5);
    });
  });
});
