import { Job, Worker } from 'bullmq';
import { MODERATION } from '../config/constants';
import * as geminiModule from '../lib/gemini';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { createNotification } from '../services/notification.service';
import { ValidationError } from '../utils/errors';

const AUTO_APPROVE_THRESHOLD = MODERATION.AUTO_APPROVE_THRESHOLD;
const AUTO_REJECT_THRESHOLD = MODERATION.AUTO_REJECT_THRESHOLD;

type ModerationJobData = {
  videoId: string;
};

type AnalysisResult = {
  scores: {
    nudity: number;
    violence: number;
    hateSpeech: number;
    illegal: number;
  };
  maxScore: number;
  summary: string;
};

type AnalyzeContentFn = (storageKey: string) => Promise<AnalysisResult>;

type AnalyzeContentWithGeminiFn = (frames: string[]) => Promise<{
  confidenceScore: number;
  categories: {
    nudity: number;
    violence: number;
    hateSpeech: number;
    illegalActivity: number;
  };
  rawResponse: string;
}>;

function hasAnalyzeContent(mod: typeof geminiModule): mod is typeof geminiModule & { analyzeContent: AnalyzeContentFn } {
  const candidate = (mod as unknown as { analyzeContent?: unknown }).analyzeContent;
  return typeof candidate === 'function';
}

function hasAnalyzeContentWithGemini(
  mod: typeof geminiModule
): mod is typeof geminiModule & { analyzeContentWithGemini: AnalyzeContentWithGeminiFn } {
  const candidate = (mod as unknown as { analyzeContentWithGemini?: unknown }).analyzeContentWithGemini;
  return typeof candidate === 'function';
}

async function analyzeContent(storageKey: string): Promise<AnalysisResult> {
  if (hasAnalyzeContent(geminiModule)) {
    return geminiModule.analyzeContent(storageKey);
  }

  if (hasAnalyzeContentWithGemini(geminiModule)) {
    const result = await geminiModule.analyzeContentWithGemini([storageKey]);
    return {
      scores: {
        nudity: result.categories.nudity,
        violence: result.categories.violence,
        hateSpeech: result.categories.hateSpeech,
        illegal: result.categories.illegalActivity,
      },
      maxScore: result.confidenceScore,
      summary: result.rawResponse,
    };
  }

  throw new ValidationError('Gemini analyzeContent function is not available.');
}

export const moderationWorker = new Worker(
  'moderation',
  async (job: Job<ModerationJobData>) => {
    const { videoId } = job.data;

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, storageKey: true, status: true },
    });

    if (!video || video.status === 'APPROVED' || video.status === 'REJECTED') {
      console.log(`[Moderation Worker] Video ${videoId}: skipped`);
      return;
    }

    let analysis: AnalysisResult;

    try {
      analysis = await analyzeContent(video.storageKey);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown AI moderation failure';
      console.error(`[Moderation Worker] AI moderation failed for video ${videoId}: ${message}`);
      throw error;
    }

    const { scores, maxScore, summary } = analysis;

    let decision: 'AUTO_APPROVED' | 'AUTO_REJECTED' | 'ESCALATED' = 'AUTO_APPROVED';
    let newStatus: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW' = 'APPROVED';

    if (maxScore >= AUTO_REJECT_THRESHOLD) {
      decision = 'AUTO_REJECTED';
      newStatus = 'REJECTED';
    } else if (maxScore >= AUTO_APPROVE_THRESHOLD) {
      decision = 'ESCALATED';
      newStatus = 'PENDING_REVIEW';
    }

    await prisma.$transaction([
      prisma.video.update({
        where: { id: videoId },
        data: { status: newStatus },
      }),
      prisma.moderationLog.create({
        data: {
          videoId,
          decision,
          aiConfidenceScore: maxScore,
          aiRawResponse: JSON.stringify(scores),
          humanNotes: summary,
        },
      }),
    ]);

    let message = 'Your video is currently under review by our moderation team.';

    if (decision === 'AUTO_APPROVED') {
      message = 'Your video is live! It has been approved and is now visible to your followers.';
    } else if (decision === 'AUTO_REJECTED') {
      message = 'Your video was removed for violating our community guidelines.';
    }

    await createNotification(video.userId, 'MODERATION', message, videoId);

    console.log(`[Moderation Worker] Video ${videoId}: ${decision} | maxScore: ${maxScore}`);
  },
  {
    connection: redis,
  }
);

moderationWorker.on('completed', (job) => {
  console.log(`[Moderation Worker] Job ${job.id} completed`);
});

moderationWorker.on('failed', (job, err) => {
  console.error(`[Moderation Worker] Job ${job?.id} failed:`, err.message);
});
