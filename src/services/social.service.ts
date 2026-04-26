// services/social.service.ts
// Social Layer: follows, comments, notifications.
// RULE: No HTTP references. Throw AppError subclasses only. No .then() chains.

import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../utils/errors';
import { createNotification } from './notification.service';
import { paginate as getPaginationParams } from '../utils/pagination';
import type { AddCommentInput } from '../validators/social.validators';

// ─── Follows ─────────────────────────────────────────────────────────────────

export async function followUser(followerId: string, followeeId: string) {
  if (followerId === followeeId) {
    throw new ValidationError('You cannot follow yourself');
  }

  // Check the followee exists and isn't banned
  const followee = await prisma.user.findUnique({ where: { id: followeeId } });
  if (!followee || followee.isBanned) {
    throw new NotFoundError('User');
  }

  // Check the follower isn't banned before allowing the action
  const follower = await prisma.user.findUnique({
    where: { id: followerId },
    select: { username: true, isBanned: true },
  });
  if (!follower || follower.isBanned) {
    throw new ForbiddenError('Banned users cannot follow others');
  }

  // Use try/catch on create to handle concurrent duplicates (P2002)
  try {
    await prisma.follow.create({ data: { followerId, followeeId } });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('Already following this user');
    }
    throw error;
  }

  try {
    await createNotification(
      followeeId,
      'FOLLOW',
      `${follower.username} started following you`,
      followerId
    );
  } catch (err) {
    console.error('[social.service] Failed to create FOLLOW notification', err);
  }

  return { following: true };
}

export async function unfollowUser(followerId: string, followeeId: string) {
  // Idempotent — no error if not following
  await prisma.follow.deleteMany({ where: { followerId, followeeId } });
  return { following: false };
}

export async function getFollowers(userId: string, page: number, limit: number) {
  const { skip, take } = getPaginationParams(page, limit);

  const [result, total] = await Promise.all([
    prisma.follow.findMany({
      where: { followeeId: userId },
      include: {
        follower: { select: { id: true, username: true, avatarUrl: true } },
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.follow.count({ where: { followeeId: userId } }),
  ]);

  return {
    followers: result.map((f) => f.follower),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getFollowing(userId: string, page: number, limit: number) {
  const { skip, take } = getPaginationParams(page, limit);

  const [result, total] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: userId },
      include: {
        followee: { select: { id: true, username: true, avatarUrl: true } },
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);

  return {
    following: result.map((f) => f.followee),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function addComment(userId: string, input: AddCommentInput) {
  const video = await prisma.video.findUnique({ where: { id: input.videoId } });
  if (!video || video.status !== 'APPROVED') {
    throw new NotFoundError('Video');
  }

  if (input.parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: input.parentId } });
    if (!parent) {
      throw new NotFoundError('Parent comment');
    }
    if (parent.videoId !== input.videoId) {
      throw new ValidationError('Parent comment does not belong to this video');
    }
  }

  const comment = await prisma.comment.create({
    data: {
      userId,
      videoId: input.videoId,
      content: input.content,
      parentId: input.parentId ?? null,
    },
    include: {
      user: { select: { id: true, username: true, avatarUrl: true } },
    },
  });

  if (video.userId !== userId) {
    try {
      await createNotification(
        video.userId,
        'COMMENT',
        `${comment.user.username} commented on your video`,
        video.id
      );
    } catch (err) {
      console.error('[social.service] Failed to create COMMENT notification', err);
    }
  }

  return comment;
}

export async function getComments(videoId: string, page: number, limit: number) {
  const { skip, take } = getPaginationParams(page, limit);

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: { videoId, parentId: null },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        _count: { select: { replies: true } },
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.comment.count({ where: { videoId, parentId: null } }),
  ]);

  return {
    comments,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getReplies(commentId: string, page: number, limit: number) {
  const parent = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!parent) {
    throw new NotFoundError('Comment');
  }

  const { skip, take } = getPaginationParams(page, limit);

  const [replies, total] = await Promise.all([
    prisma.comment.findMany({
      where: { parentId: commentId },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
      skip,
      take,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.comment.count({ where: { parentId: commentId } }),
  ]);

  return {
    replies,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function deleteComment(commentId: string, userId: string, userRole: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) {
    throw new NotFoundError('Comment');
  }

  if (
    comment.userId !== userId &&
    userRole !== 'ADMIN' &&
    userRole !== 'MODERATOR'
  ) {
    throw new ForbiddenError('You can only delete your own comments');
  }

  // BFS to find all descendants
  const allIds: string[] = [commentId];
  let currentIds: string[] = [commentId];

  while (currentIds.length > 0) {
    const children = await prisma.comment.findMany({
      where: { parentId: { in: currentIds } },
      select: { id: true },
    });
    
    if (children.length === 0) break;
    
    currentIds = children.map(c => c.id);
    allIds.push(...currentIds);
  }

  // Atomically delete all descendants and the root
  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { id: { in: allIds } } })
  ]);

  return { success: true };
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getNotifications(userId: string, page: number, limit: number) {
  const { skip, take } = getPaginationParams(page, limit);

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    notifications,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    unreadCount,
  };
}

export async function markNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });

  return { success: true };
}
