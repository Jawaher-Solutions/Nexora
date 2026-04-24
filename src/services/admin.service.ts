import { prisma } from '../lib/prisma';
import { NotFoundError, ForbiddenError } from '../utils/errors';

export async function getModerationQueue(page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const videos = await prisma.video.findMany({
    where: { status: 'PENDING_REVIEW' },
    skip,
    take: limit,
    orderBy: { flagsCount: 'desc' },
  });
  
  const total = await prisma.video.count({ where: { status: 'PENDING_REVIEW' } });
  
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
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new NotFoundError('User');
  if (target.role === 'ADMIN') throw new ForbiddenError('Cannot ban an admin');

  return prisma.user.update({
    where: { id: targetUserId },
    data: { isBanned: true },
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
  return prisma.moderationLog.findMany({
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      moderator: { select: { username: true } },
    },
  });
}
