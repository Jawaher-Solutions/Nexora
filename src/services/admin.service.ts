// services/admin.service.ts
// Admin & Moderation service layer. No HTTP references. Throws AppError subclasses only.

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../utils/errors';
import { createNotification } from './notification.service';
import { paginate } from '../utils/pagination';
import type {
  AdminQueueQuery,
  AdminUsersQuery,
  BanUserInput,
  ModerationLogsQuery,
  ReviewVideoInput,
} from '../validators/admin.validators';

// ─── Moderation Queue ─────────────────────────────────────────────────────────

export async function getModerationQueue(query: AdminQueueQuery) {
  const { skip, take } = paginate(query.page, query.limit);

  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where: { status: 'PENDING_REVIEW' },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        moderationLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            decision:          true,
            aiConfidenceScore: true,
            aiRawResponse:     true,
            humanNotes:        true,
            createdAt:         true,
          },
        },
        _count: { select: { flags: true } },
      },
      orderBy: { createdAt: 'asc' },
      skip,
      take,
    }),
    prisma.video.count({ where: { status: 'PENDING_REVIEW' } }),
  ]);

  return {
    queue: videos,
    pagination: {
      total,
      page:       query.page,
      limit:      query.limit,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ─── Review Video ─────────────────────────────────────────────────────────────

export async function reviewVideo(
  videoId:     string,
  moderatorId: string,
  input:       ReviewVideoInput,
) {
  const video = await prisma.video.findUnique({
    where:   { id: videoId },
    include: { user: { select: { id: true } } },
  });

  if (!video) throw new NotFoundError('Video');

  if (video.status !== 'PENDING_REVIEW') {
    throw new ValidationError(
      `Video is not pending review. Current status: ${video.status}`,
    );
  }

  // Map decision to DB enums
  let newStatus:   'APPROVED' | 'REJECTED' | 'FLAGGED';
  let logDecision: 'HUMAN_APPROVED' | 'HUMAN_REJECTED';

  switch (input.decision) {
    case 'approve':
      newStatus   = 'APPROVED';
      logDecision = 'HUMAN_APPROVED';
      break;
    case 'reject':
      newStatus   = 'REJECTED';
      logDecision = 'HUMAN_REJECTED';
      break;
    case 'restrict':
      newStatus   = 'FLAGGED';
      logDecision = 'HUMAN_REJECTED';
      break;
  }

  await prisma.$transaction([
    prisma.video.update({
      where: { id: videoId },
      data:  { status: newStatus },
    }),
    prisma.moderationLog.create({
      data: {
        videoId,
        moderatorId,
        decision:   logDecision,
        humanNotes: input.notes ?? null,
      },
    }),
  ]);

  // Build suffix from moderator notes if provided
  const notesSuffix = input.notes
    ? ` Moderator note: ${input.notes}`
    : "";

  // Replace existing notification messages map:
  const notificationMessages: Record<string, string> = {
    approve:  "Your video has been manually reviewed and approved by our moderation team. It is now live!",
    reject:   `Your video was reviewed and removed for violating our community guidelines.${notesSuffix}`,
    restrict: `Your video has been restricted following a moderation review.${notesSuffix} It is no longer publicly visible.`,
  };

  const message = notificationMessages[input.decision];

  await createNotification(
    video.user.id,
    'MODERATION',
    message,
    videoId,
  );

  return { success: true, videoId, newStatus, decision: logDecision };
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUsers(query: AdminUsersQuery) {
  const { skip, take } = paginate(query.page, query.limit);

  const where: Prisma.UserWhereInput = {};
  if (query.search) {
    where.OR = [
      { username: { contains: query.search, mode: 'insensitive' } },
      { email:    { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.isBanned !== undefined) where.isBanned = query.isBanned;
  if (query.role)                   where.role     = query.role;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id:         true,
        username:   true,
        email:      true,
        avatarUrl:  true,
        role:       true,
        isBanned:   true,
        isVerified: true,
        createdAt:  true,
        _count: {
          select: {
            videos:    true,
            followers: true,
            following: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    pagination: {
      total,
      page:       query.page,
      limit:      query.limit,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ─── User By ID ───────────────────────────────────────────────────────────────

export async function getUserById(targetUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id:         true,
      username:   true,
      email:      true,
      avatarUrl:  true,
      role:       true,
      isBanned:   true,
      isVerified: true,
      publicKey:  true,
      createdAt:  true,
      _count: {
        select: {
          videos:    true,
          followers: true,
          following: true,
          flags:     true,
        },
      },
    },
  });

  if (!user) throw new NotFoundError('User');

  return user;
}

// ─── Ban User ─────────────────────────────────────────────────────────────────

export async function banUser(
  targetUserId: string,
  moderatorId:  string,
  input:        BanUserInput,
) {
  const target = await prisma.user.findUnique({
    where:  { id: targetUserId },
    select: { id: true, role: true, isBanned: true },
  });

  if (!target)             throw new NotFoundError('User');
  if (target.isBanned)     throw new ConflictError('User is already banned');
  if (target.role === 'ADMIN') {
    throw new ForbiddenError('Administrators cannot be banned');
  }
  if (targetUserId === moderatorId) {
    throw new ForbiddenError('You cannot ban yourself');
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data:  { isBanned: true },
  });

  await createNotification(
    targetUserId,
    'MODERATION',
    `Your account has been suspended. Reason: ${input.reason}`,
  );

  return { success: true, userId: targetUserId };
}

// ─── Unban User ───────────────────────────────────────────────────────────────

export async function unbanUser(targetUserId: string) {
  const target = await prisma.user.findUnique({
    where:  { id: targetUserId },
    select: { id: true, isBanned: true },
  });

  if (!target)          throw new NotFoundError('User');
  if (!target.isBanned) throw new ConflictError('User is not banned');

  await prisma.user.update({
    where: { id: targetUserId },
    data:  { isBanned: false },
  });

  await createNotification(
    targetUserId,
    'MODERATION',
    'Your account suspension has been lifted. Welcome back!',
  );

  return { success: true, userId: targetUserId };
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalytics() {
  const now          = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    newUsersToday,
    newUsersThisWeek,
    totalVideos,
    pendingReview,
    approvedTotal,
    rejectedTotal,
    totalFlags,
    totalMessages,
    moderationBreakdown,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfWeek  } } }),
    prisma.video.count(),
    prisma.video.count({ where: { status: 'PENDING_REVIEW' } }),
    prisma.video.count({ where: { status: 'APPROVED'       } }),
    prisma.video.count({ where: { status: 'REJECTED'       } }),
    prisma.flag.count(),
    prisma.message.count(),
    prisma.moderationLog.groupBy({
      by:     ['decision'],
      _count: { decision: true },
    }),
  ]);

  // Suppress unused variable warning — startOfMonth is intentionally kept for
  // potential future analytics without altering the Promise.all structure.
  void startOfMonth;

  const breakdown = moderationBreakdown.reduce<Record<string, number>>((acc, item) => {
    acc[item.decision] = item._count.decision;
    return acc;
  }, {});

  return {
    users: {
      total:       totalUsers,
      newToday:    newUsersToday,
      newThisWeek: newUsersThisWeek,
    },
    videos: {
      total:         totalVideos,
      pendingReview,
      approved:      approvedTotal,
      rejected:      rejectedTotal,
    },
    moderation: {
      totalFlags,
      moderationBreakdown: breakdown,
    },
    messages: {
      total: totalMessages,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ─── Moderation Logs ──────────────────────────────────────────────────────────

export async function getModerationLogs(query: ModerationLogsQuery) {
  const { skip, take } = paginate(query.page, query.limit);

  const where: Prisma.ModerationLogWhereInput = {};
  if (query.decision)    where.decision    = query.decision;
  if (query.videoId)     where.videoId     = query.videoId;
  if (query.moderatorId) where.moderatorId = query.moderatorId;

  if (query.startDate || query.endDate) {
    where.createdAt = {};
    if (query.startDate) (where.createdAt as Prisma.DateTimeFilter).gte = query.startDate;
    if (query.endDate)   (where.createdAt as Prisma.DateTimeFilter).lte = query.endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.moderationLog.findMany({
      where,
      include: {
        video:     { select: { id: true, title: true, storageKey: true, status: true, type: true } },
        moderator: { select: { id: true, username: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.moderationLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      total,
      page:       query.page,
      limit:      query.limit,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}
