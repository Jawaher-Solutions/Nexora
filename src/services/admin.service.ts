import { prisma } from '../lib/prisma';
import { NotFoundError, ForbiddenError } from '../utils/errors';

export async function getModerationQueue(page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where: { status: 'PENDING_REVIEW' },
      skip,
      take: limit,
      orderBy: { flagsCount: 'desc' },
    }),
    prisma.video.count({ where: { status: 'PENDING_REVIEW' } })
  ]);
  
  return {
    videos,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function reviewVideo(videoId: string, moderatorId: string, decision: 'APPROVE' | 'REJECT', notes?: string) {
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) throw new NotFoundError('Video');

  const newStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  const modDecision = decision === 'APPROVE' ? 'HUMAN_APPROVED' : 'HUMAN_REJECTED';

  const updatedVideo = await prisma.$transaction(async (tx) => {
    const v = await tx.video.update({
      where: { id: videoId },
      data: { status: newStatus },
    });

    await tx.moderationLog.create({
      data: {
        videoId,
        moderatorId,
        decision: modDecision,
        humanNotes: notes,
      },
    });

    return v;
  });

  return updatedVideo;
}

export async function banUser(targetUserId: string, adminId: string) {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== 'ADMIN') {
    throw new ForbiddenError('Only admins can ban users');
  }

  if (targetUserId === adminId) {
    throw new ForbiddenError('You cannot ban yourself');
  }
  
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new NotFoundError('User');
  if (target.role === 'ADMIN') throw new ForbiddenError('Cannot ban an admin');

  if (target.isBanned) return target;

  return await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: targetUserId },
      data: { isBanned: true },
    });

    // NOTE: Audit logging for user bans is currently limited by the schema.
    // ModerationLog requires a videoId. We record it as a metadata comment if possible,
    // or skip if schema doesn't support video-less logs.
    // For now, we skip the log to avoid runtime errors until schema is updated.
    
    return updatedUser;
  });
}

export async function getAnalytics() {
  const [totalUsers, totalVideos, pendingReviews] = await Promise.all([
    prisma.user.count(),
    prisma.video.count(),
    prisma.video.count({ where: { status: 'PENDING_REVIEW' } }),
  ]);

  return { totalUsers, totalVideos, pendingReviews };
}

export async function getModerationLogs(page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    prisma.moderationLog.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        moderator: { select: { username: true } },
      }
    }),
    prisma.moderationLog.count()
  ]);

  return {
    logs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
