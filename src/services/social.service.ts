import { prisma } from '../lib/prisma';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../utils/errors';

export async function followUser(followerId: string, followeeId: string) {
  if (followerId === followeeId) {
    throw new ValidationError('Users cannot follow themselves');
  }

  const followee = await prisma.user.findUnique({ where: { id: followeeId } });
  if (!followee) {
    throw new NotFoundError('User');
  }

  try {
    const follow = await prisma.follow.create({
      data: { followerId, followeeId },
    });

    await prisma.notification.create({
      data: {
        userId: followeeId,
        type: 'FOLLOW',
        message: 'Someone started following you.',
        referenceId: followerId,
      },
    });

    return follow;
  } catch (err: any) {
    if (err.code === 'P2002') {
      throw new ConflictError('Already following this user');
    }
    throw err;
  }
}

export async function unfollowUser(followerId: string, followeeId: string) {
  try {
    await prisma.follow.delete({
      where: { followerId_followeeId: { followerId, followeeId } },
    });
  } catch (err: any) {
    if (err.code === 'P2025') {
      throw new NotFoundError('Follow record');
    }
    throw err;
  }
}

export async function addComment(userId: string, videoId: string, content: string, parentId?: string) {
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) throw new NotFoundError('Video');

  if (parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundError('Parent comment');
  }

  const comment = await prisma.comment.create({
    data: { userId, videoId, content, parentId },
  });

  if (video.userId !== userId) {
    await prisma.notification.create({
      data: {
        userId: video.userId,
        type: 'COMMENT',
        message: 'Someone commented on your video.',
        referenceId: comment.id,
      },
    });
  }

  return comment;
}

export async function deleteComment(commentId: string, userId: string, userRole: 'USER' | 'MODERATOR' | 'ADMIN') {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new NotFoundError('Comment');

  if (comment.userId !== userId && userRole === 'USER') {
    throw new ForbiddenError('Not authorized to delete this comment');
  }

  await prisma.comment.delete({ where: { id: commentId } });
}

export async function getNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}
