import { prisma } from '../../src/lib/prisma';
import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  addComment,
  getComments,
  getReplies,
  deleteComment,
  getNotifications,
  markNotificationsRead,
} from '../../src/services/social.service';
import { createTestUser, createTestVideo, cleanAll } from '../helpers/db';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '../../src/utils/errors';

describe('social.service integration', () => {
  beforeEach(async () => {
    await cleanAll();
  });

  // ─── followUser ─────────────────────────────────────────────────────────────

  describe('followUser', () => {
    it('creates a follow record and returns { following: true }', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();

      const result = await followUser(u1.id, u2.id);

      expect(result).toEqual({ following: true });

      const record = await prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: u1.id, followeeId: u2.id } },
      });
      expect(record).not.toBeNull();
    });

    it('creates a FOLLOW notification for the followee', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();

      await followUser(u1.id, u2.id);

      const notif = await prisma.notification.findFirst({ where: { userId: u2.id } });
      expect(notif).not.toBeNull();
      expect(notif!.type).toBe('FOLLOW');
      expect(notif!.message).toContain(u1.username);
    });

    it('throws ValidationError when following self', async () => {
      const u1 = await createTestUser();
      await expect(followUser(u1.id, u1.id)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError when followee does not exist', async () => {
      const u1 = await createTestUser();
      await expect(followUser(u1.id, '00000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError when followee is banned', async () => {
      const u1 = await createTestUser();
      const banned = await createTestUser({ isBanned: true });
      await expect(followUser(u1.id, banned.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ConflictError if already following', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      await followUser(u1.id, u2.id);
      await expect(followUser(u1.id, u2.id)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  // ─── unfollowUser ────────────────────────────────────────────────────────────

  describe('unfollowUser', () => {
    it('removes a follow record and returns { following: false }', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      await followUser(u1.id, u2.id);

      const result = await unfollowUser(u1.id, u2.id);
      expect(result).toEqual({ following: false });

      const record = await prisma.follow.findMany();
      expect(record.length).toBe(0);
    });

    it('is idempotent — no error when not following', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      await expect(unfollowUser(u1.id, u2.id)).resolves.toEqual({ following: false });
    });
  });

  // ─── getFollowers / getFollowing ─────────────────────────────────────────────

  describe('getFollowers', () => {
    it('returns paginated list of followers', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      const u3 = await createTestUser();
      await followUser(u2.id, u1.id);
      await followUser(u3.id, u1.id);

      const result = await getFollowers(u1.id, 1, 10);
      expect(result.followers.length).toBe(2);
      expect(result.pagination.total).toBe(2);
    });

    it('returns empty array when user has no followers', async () => {
      const u1 = await createTestUser();
      const result = await getFollowers(u1.id, 1, 10);
      expect(result.followers).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it('respects limit correctly', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      const u3 = await createTestUser();
      await followUser(u2.id, u1.id);
      await followUser(u3.id, u1.id);

      const result = await getFollowers(u1.id, 1, 1);
      expect(result.followers.length).toBe(1);
      expect(result.pagination.totalPages).toBe(2);
    });
  });

  describe('getFollowing', () => {
    it('returns paginated list of users being followed', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      const u3 = await createTestUser();
      await followUser(u1.id, u2.id);
      await followUser(u1.id, u3.id);

      const result = await getFollowing(u1.id, 1, 10);
      expect(result.following.length).toBe(2);
      expect(result.pagination.total).toBe(2);
    });

    it('returns empty when user follows nobody', async () => {
      const u1 = await createTestUser();
      const result = await getFollowing(u1.id, 1, 10);
      expect(result.following).toEqual([]);
    });
  });

  // ─── addComment ──────────────────────────────────────────────────────────────

  describe('addComment', () => {
    it('creates a comment with user info and returns it', async () => {
      const owner = await createTestUser();
      const commenter = await createTestUser();
      const video = await createTestVideo(owner.id);

      const comment = await addComment(commenter.id, { videoId: video.id, content: 'Nice!' });
      expect(comment.content).toBe('Nice!');
      expect(comment.userId).toBe(commenter.id);
      expect(comment.user).toBeDefined();
      expect(comment.user.username).toBe(commenter.username);
    });

    it('notifies the video owner when someone else comments', async () => {
      const owner = await createTestUser();
      const commenter = await createTestUser();
      const video = await createTestVideo(owner.id);

      await addComment(commenter.id, { videoId: video.id, content: 'Great!' });

      const notif = await prisma.notification.findFirst({ where: { userId: owner.id } });
      expect(notif).not.toBeNull();
      expect(notif!.type).toBe('COMMENT');
      expect(notif!.message).toContain(commenter.username);
    });

    it('does NOT notify when the owner comments on their own video', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id);

      await addComment(owner.id, { videoId: video.id, content: 'My own comment' });

      const count = await prisma.notification.count({ where: { userId: owner.id } });
      expect(count).toBe(0);
    });

    it('creates a reply when parentId is provided', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id);

      const parent = await addComment(owner.id, { videoId: video.id, content: 'First' });
      const reply = await addComment(owner.id, {
        videoId: video.id,
        content: 'Reply',
        parentId: parent.id,
      });

      expect(reply.parentId).toBe(parent.id);
    });

    it('throws NotFoundError for non-existent video', async () => {
      const user = await createTestUser();
      await expect(
        addComment(user.id, { videoId: '00000000-0000-4000-8000-000000000099', content: 'hi' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError for a video with status PENDING (not APPROVED)', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id, { status: 'PENDING' });
      await expect(
        addComment(owner.id, { videoId: video.id, content: 'hi' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError for a non-existent parentId', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id);
      await expect(
        addComment(owner.id, {
          videoId: video.id,
          content: 'reply',
          parentId: '00000000-0000-4000-8000-000000000099',
        })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ValidationError when parentId belongs to a different video', async () => {
      const owner = await createTestUser();
      const video1 = await createTestVideo(owner.id);
      const video2 = await createTestVideo(owner.id);

      const parentOnV1 = await addComment(owner.id, { videoId: video1.id, content: 'v1 comment' });

      await expect(
        addComment(owner.id, {
          videoId: video2.id,
          content: 'wrong parent',
          parentId: parentOnV1.id,
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  // ─── getComments ─────────────────────────────────────────────────────────────

  describe('getComments', () => {
    it('returns top-level comments with reply counts', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id);

      const parent = await addComment(owner.id, { videoId: video.id, content: 'Top-level' });
      await addComment(owner.id, {
        videoId: video.id,
        content: 'Reply',
        parentId: parent.id,
      });

      const result = await getComments(video.id, 1, 10);
      expect(result.comments.length).toBe(1);
      expect(result.comments[0]._count.replies).toBe(1);
      expect(result.pagination.total).toBe(1);
    });

    it('returns empty when video has no top-level comments', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id);
      const result = await getComments(video.id, 1, 10);
      expect(result.comments).toEqual([]);
    });
  });

  // ─── getReplies ──────────────────────────────────────────────────────────────

  describe('getReplies', () => {
    it('returns replies for a parent comment', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id);

      const parent = await addComment(owner.id, { videoId: video.id, content: 'Parent' });
      await addComment(owner.id, { videoId: video.id, content: 'Reply 1', parentId: parent.id });
      await addComment(owner.id, { videoId: video.id, content: 'Reply 2', parentId: parent.id });

      const result = await getReplies(parent.id, 1, 10);
      expect(result.replies.length).toBe(2);
      expect(result.pagination.total).toBe(2);
    });

    it('throws NotFoundError for a non-existent comment', async () => {
      await expect(
        getReplies('00000000-0000-4000-8000-000000000099', 1, 10)
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ─── deleteComment ────────────────────────────────────────────────────────────

  describe('deleteComment', () => {
    it('allows a user to delete their own comment', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id);
      const comment = await addComment(owner.id, { videoId: video.id, content: 'Mine' });

      const result = await deleteComment(comment.id, owner.id, 'USER');
      expect(result).toEqual({ success: true });

      const found = await prisma.comment.findUnique({ where: { id: comment.id } });
      expect(found).toBeNull();
    });

    it('cascades deletion of replies', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id);
      const parent = await addComment(owner.id, { videoId: video.id, content: 'Parent' });
      await addComment(owner.id, { videoId: video.id, content: 'Reply', parentId: parent.id });

      await deleteComment(parent.id, owner.id, 'USER');

      const all = await prisma.comment.findMany();
      expect(all.length).toBe(0);
    });

    it('throws ForbiddenError when a USER deletes another user\'s comment', async () => {
      const owner = await createTestUser();
      const other = await createTestUser();
      const video = await createTestVideo(owner.id);
      const comment = await addComment(owner.id, { videoId: video.id, content: 'Owner comment' });

      await expect(deleteComment(comment.id, other.id, 'USER')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('allows a MODERATOR to delete any comment', async () => {
      const owner = await createTestUser();
      const mod = await createTestUser({ role: 'MODERATOR' });
      const video = await createTestVideo(owner.id);
      const comment = await addComment(owner.id, { videoId: video.id, content: 'Bad content' });

      await expect(deleteComment(comment.id, mod.id, 'MODERATOR')).resolves.toEqual({ success: true });
    });

    it('allows an ADMIN to delete any comment', async () => {
      const owner = await createTestUser();
      const admin = await createTestUser({ role: 'ADMIN' });
      const video = await createTestVideo(owner.id);
      const comment = await addComment(owner.id, { videoId: video.id, content: 'Content' });

      await expect(deleteComment(comment.id, admin.id, 'ADMIN')).resolves.toEqual({ success: true });
    });

    it('throws NotFoundError for a non-existent comment', async () => {
      const user = await createTestUser();
      await expect(
        deleteComment('00000000-0000-4000-8000-000000000099', user.id, 'USER')
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ─── getNotifications ─────────────────────────────────────────────────────────

  describe('getNotifications', () => {
    it('returns notifications with pagination and unreadCount', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();

      // Generate 2 notifications (follow creates one)
      await followUser(u2.id, u1.id);
      const video = await createTestVideo(u1.id);
      await addComment(u2.id, { videoId: video.id, content: 'hi' });

      const result = await getNotifications(u1.id, 1, 10);
      expect(result.notifications.length).toBe(2);
      expect(result.pagination.total).toBe(2);
      expect(result.unreadCount).toBe(2);
    });

    it('returns empty when user has no notifications', async () => {
      const u1 = await createTestUser();
      const result = await getNotifications(u1.id, 1, 10);
      expect(result.notifications).toEqual([]);
      expect(result.unreadCount).toBe(0);
    });
  });

  // ─── markNotificationsRead ────────────────────────────────────────────────────

  describe('markNotificationsRead', () => {
    it('marks all unread notifications as read and returns { success: true }', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      await followUser(u2.id, u1.id);

      const beforeMark = await getNotifications(u1.id, 1, 10);
      expect(beforeMark.unreadCount).toBe(1);

      const result = await markNotificationsRead(u1.id);
      expect(result).toEqual({ success: true });

      const afterMark = await getNotifications(u1.id, 1, 10);
      expect(afterMark.unreadCount).toBe(0);
    });

    it('is a no-op when there are no unread notifications', async () => {
      const u1 = await createTestUser();
      await expect(markNotificationsRead(u1.id)).resolves.toEqual({ success: true });
    });
  });
});
