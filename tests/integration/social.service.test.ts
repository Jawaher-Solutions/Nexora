import { prisma } from '../../src/lib/prisma';
import * as socialService from '../../src/services/social.service';
import { createTestUser, createTestVideo } from '../helpers/db';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../src/utils/errors';

describe('social.service integration', () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.follow.deleteMany();
    await prisma.video.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('followUser / unfollowUser', () => {
    it('allows a user to follow another user and creates a notification', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();

      const follow = await socialService.followUser(u1.id, u2.id);
      expect(follow.followerId).toBe(u1.id);
      expect(follow.followeeId).toBe(u2.id);

      const notifs = await socialService.getNotifications(u2.id);
      expect(notifs.length).toBe(1);
      expect(notifs[0].type).toBe('FOLLOW');
    });

    it('prevents a user from following themselves', async () => {
      const u1 = await createTestUser();
      await expect(socialService.followUser(u1.id, u1.id)).rejects.toThrow(ValidationError);
    });

    it('throws ConflictError if already following', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      await socialService.followUser(u1.id, u2.id);
      await expect(socialService.followUser(u1.id, u2.id)).rejects.toThrow(ConflictError);
    });

    it('throws NotFoundError if followee does not exist', async () => {
      const u1 = await createTestUser();
      await expect(socialService.followUser(u1.id, 'fake-id')).rejects.toThrow(NotFoundError);
    });

    it('allows unfollowing', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      await socialService.followUser(u1.id, u2.id);
      await socialService.unfollowUser(u1.id, u2.id);
      const follows = await prisma.follow.findMany();
      expect(follows.length).toBe(0);
    });

    it('throws NotFoundError if unfollowing non-existent follow', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      await expect(socialService.unfollowUser(u1.id, u2.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe('addComment / deleteComment', () => {
    it('adds a comment and notifies video owner', async () => {
      const owner = await createTestUser();
      const commenter = await createTestUser();
      const video = await createTestVideo(owner.id);

      const comment = await socialService.addComment(commenter.id, video.id, 'Nice video!');
      expect(comment.content).toBe('Nice video!');

      const notifs = await socialService.getNotifications(owner.id);
      expect(notifs.length).toBe(1);
      expect(notifs[0].type).toBe('COMMENT');
    });

    it('does not notify if commenting on own video', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id);

      await socialService.addComment(owner.id, video.id, 'My comment');
      const notifs = await socialService.getNotifications(owner.id);
      expect(notifs.length).toBe(0);
    });

    it('adds a reply to a comment', async () => {
      const owner = await createTestUser();
      const commenter = await createTestUser();
      const video = await createTestVideo(owner.id);

      const parent = await socialService.addComment(commenter.id, video.id, 'First!');
      const reply = await socialService.addComment(commenter.id, video.id, 'Reply', parent.id);

      expect(reply.parentId).toBe(parent.id);
    });

    it('throws NotFoundError for invalid video', async () => {
      const user = await createTestUser();
      await expect(socialService.addComment(user.id, 'fake', 'hi')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for invalid parent comment', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id);
      await expect(socialService.addComment(owner.id, video.id, 'hi', 'fake')).rejects.toThrow(NotFoundError);
    });

    it('allows a user to delete their own comment', async () => {
      const owner = await createTestUser();
      const video = await createTestVideo(owner.id);
      const comment = await socialService.addComment(owner.id, video.id, 'My comment');

      await socialService.deleteComment(comment.id, owner.id, 'USER');
      const comments = await prisma.comment.findMany();
      expect(comments.length).toBe(0);
    });

    it('prevents a user from deleting someone else comment', async () => {
      const owner = await createTestUser();
      const commenter = await createTestUser();
      const video = await createTestVideo(owner.id);
      const comment = await socialService.addComment(commenter.id, video.id, 'My comment');

      await expect(socialService.deleteComment(comment.id, owner.id, 'USER')).rejects.toThrow(ForbiddenError);
    });

    it('allows MODERATOR to delete any comment', async () => {
      const owner = await createTestUser();
      const commenter = await createTestUser();
      const mod = await createTestUser({ role: 'MODERATOR' });
      const video = await createTestVideo(owner.id);
      const comment = await socialService.addComment(commenter.id, video.id, 'Bad comment');

      await socialService.deleteComment(comment.id, mod.id, 'MODERATOR');
      const comments = await prisma.comment.findMany();
      expect(comments.length).toBe(0);
    });

    it('throws NotFoundError when deleting non-existent comment', async () => {
      const user = await createTestUser();
      await expect(socialService.deleteComment('fake', user.id, 'USER')).rejects.toThrow(NotFoundError);
    });
  });
});
