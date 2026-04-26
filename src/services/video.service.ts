import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { env } from '../config/env';
import { FLAG_THRESHOLD } from '../config/constants';
import { prisma } from '../lib/prisma';
import { r2 } from '../lib/r2';
import { addModerationJob } from '../jobs/queues';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { createNotification } from './notification.service';
import { paginate as getPaginationParams } from '../utils/pagination';
import type { RequestUploadInput } from '../validators/video.validators';

export async function requestUpload(userId: string, input: RequestUploadInput) {
  const storageKey = `videos/${userId}/${randomUUID()}.mp4`;
  const thumbnailKey = `thumbnails/${userId}/${randomUUID()}.jpg`;

  const uploadCommand = new PutObjectCommand({
    Bucket: env.CLOUDFLARE_R2_BUCKET,
    Key: storageKey,
    ContentType: input.contentType,
  });

  const uploadUrl = await getSignedUrl(r2, uploadCommand, { expiresIn: 3600 });

  const video = await prisma.video.create({
    data: {
      userId,
      title: input.title,
      description: input.description,
      type: input.type,
      durationSeconds: input.durationSeconds,
      storageKey,
      thumbnailUrl: thumbnailKey,
      status: 'PENDING',
    },
  });

  return {
    videoId: video.id,
    uploadUrl,
    storageKey,
  };
}

export async function confirmUpload(videoId: string, userId: string) {
  const video = await prisma.video.findFirst({
    where: { id: videoId, userId },
  });

  if (!video) {
    throw new NotFoundError('Video');
  }

  try {
    await r2.send(
      new HeadObjectCommand({
        Bucket: env.CLOUDFLARE_R2_BUCKET,
        Key: video.storageKey,
      })
    );
  } catch {
    throw new ValidationError('Video file not found in storage. Upload the file first.');
  }

  await addModerationJob(videoId);

  return {
    message: 'Video submitted for review',
    videoId,
  };
}

export async function getVideoById(videoId: string, requestingUserId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!video) {
    throw new NotFoundError('Video');
  }

  if (video.status !== 'APPROVED' && video.userId !== requestingUserId) {
    throw new ForbiddenError('Video is not available');
  }

  let streamUrl = video.streamUrl;

  if (video.status === 'APPROVED') {
    const getCommand = new GetObjectCommand({
      Bucket: env.CLOUDFLARE_R2_BUCKET,
      Key: video.storageKey,
    });

    streamUrl = await getSignedUrl(r2, getCommand, { expiresIn: 86400 });
  }

  return {
    ...video,
    streamUrl,
  };
}

export async function getUserVideos(userId: string, page?: number, limit?: number) {
  const { skip, take, page: currentPage, limit: currentLimit } = getPaginationParams(page, limit);

  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.video.count({ where: { userId } }),
  ]);

  return {
    videos,
    pagination: {
      total,
      page: currentPage,
      limit: currentLimit,
      totalPages: Math.ceil(total / currentLimit),
    },
  };
}

export async function getFeed(userId: string, page?: number, limit?: number) {
  const { skip, take, page: currentPage, limit: currentLimit } = getPaginationParams(page, limit);

  const followed = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followeeId: true },
  });

  const userIds = Array.from(new Set([...followed.map((f) => f.followeeId), userId]));

  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where: {
        userId: { in: userIds },
        status: 'APPROVED',
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.video.count({
      where: {
        userId: { in: userIds },
        status: 'APPROVED',
      },
    }),
  ]);

  return {
    videos,
    pagination: {
      total,
      page: currentPage,
      limit: currentLimit,
      totalPages: Math.ceil(total / currentLimit),
    },
  };
}

export async function deleteVideo(videoId: string, userId: string) {
  const video = await prisma.video.findFirst({
    where: { id: videoId, userId },
  });

  if (!video) {
    throw new NotFoundError('Video');
  }

  await r2.send(
    new DeleteObjectCommand({
      Bucket: env.CLOUDFLARE_R2_BUCKET,
      Key: video.storageKey,
    })
  );

  await prisma.video.delete({
    where: { id: videoId },
  });

  return { success: true };
}

export async function likeVideo(userId: string, videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, status: true },
  });

  if (!video || video.status !== 'APPROVED') {
    throw new NotFoundError('Video');
  }

  const updatedVideo = await prisma.$transaction(async (tx) => {
    try {
      await tx.like.create({
        data: { userId, videoId },
      });
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new ConflictError('Already liked');
      }
      throw error;
    }

    return tx.video.update({
      where: { id: videoId },
      data: { likesCount: { increment: 1 } },
      select: { likesCount: true },
    });
  });

  return {
    liked: true,
    likesCount: updatedVideo.likesCount,
  };
}

export async function unlikeVideo(userId: string, videoId: string) {
  await prisma.$transaction(async (tx) => {
    const deleted = await tx.like.deleteMany({
      where: { userId, videoId },
    });

    if (deleted.count === 0) {
      throw new NotFoundError('Like');
    }

    const current = await tx.video.findUnique({
      where: { id: videoId },
      select: { likesCount: true },
    });

    if (!current) {
      throw new NotFoundError('Video');
    }

    await tx.video.update({
      where: { id: videoId },
      data: {
        likesCount: Math.max(current.likesCount - 1, 0),
      },
    });
  });

  return { liked: false };
}

export async function flagVideo(userId: string, videoId: string, reason: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, userId: true },
  });

  if (!video) {
    throw new NotFoundError('Video');
  }

  await prisma.flag.create({
    data: { userId, videoId, reason },
  });

  const updatedVideo = await prisma.video.update({
    where: { id: videoId },
    data: { flagsCount: { increment: 1 } },
    select: { id: true, userId: true, flagsCount: true, likesCount: true },
  });

  if (updatedVideo.likesCount > 10 && updatedVideo.flagsCount > updatedVideo.likesCount * FLAG_THRESHOLD) {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'PENDING_REVIEW' },
    });

    await addModerationJob(videoId);

    await createNotification(
      updatedVideo.userId,
      'MODERATION',
      'Your video has been flagged for review by the community.',
      videoId
    );
  }

  return {
    flagged: true,
    flagsCount: updatedVideo.flagsCount,
  };
}

export async function dislikeVideo(userId: string, videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, status: true },
  });
  if (!video || video.status !== "APPROVED") {
    throw new NotFoundError("Video");
  }

  const updatedVideo = await prisma.$transaction(async (tx) => {
    const currentVideo = await tx.video.findUnique({ where: { id: videoId }, select: { status: true } });
    if (!currentVideo || currentVideo.status !== "APPROVED") {
      throw new NotFoundError("Video");
    }

    try {
      await tx.dislike.create({ data: { userId, videoId } });
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new ConflictError("Already disliked");
      }
      throw error;
    }
    return tx.video.update({
      where: { id: videoId },
      data: { dislikesCount: { increment: 1 } },
    });
  });

  return { disliked: true, dislikesCount: updatedVideo.dislikesCount };
}

export async function undislikeVideo(userId: string, videoId: string) {
  await prisma.$transaction(async (tx) => {
    const result = await tx.dislike.deleteMany({
      where: { userId, videoId },
    });

    if (result.count === 0) {
      throw new NotFoundError("Dislike");
    }

    const current = await tx.video.findUnique({
      where: { id: videoId },
      select: { dislikesCount: true },
    });

    if (!current) {
      throw new NotFoundError('Video');
    }

    await tx.video.update({
      where: { id: videoId },
      data: {
        dislikesCount: Math.max(current.dislikesCount - 1, 0),
      },
    });
  });

  const updated = await prisma.video.findUnique({
    where: { id: videoId },
    select: { dislikesCount: true },
  });

  return { disliked: false, dislikesCount: updated?.dislikesCount ?? 0 };
}

const shareRateLimits = new Set<string>();

export async function shareVideo(userId: string, videoId: string) {
  const rateLimitKey = `${userId}:${videoId}`;
  if (shareRateLimits.has(rateLimitKey)) {
    throw new ConflictError("Rate limit exceeded for sharing this video");
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, status: true },
  });
  if (!video || video.status !== "APPROVED") {
    throw new NotFoundError("Video");
  }

  shareRateLimits.add(rateLimitKey);
  setTimeout(() => shareRateLimits.delete(rateLimitKey), 60000);

  const updatedVideo = await prisma.video.update({
    where: { id: videoId },
    data: { sharesCount: { increment: 1 } },
  });

  return { shared: true, sharesCount: updatedVideo.sharesCount };
}
