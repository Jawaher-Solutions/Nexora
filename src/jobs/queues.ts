import { Queue } from 'bullmq';
import { redis } from '../lib/redis';

export const moderationQueue = new Queue('moderation', {
  connection: redis,
});

export async function addModerationJob(videoId: string) {
  await moderationQueue.add(
    'moderate-video',
    { videoId },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    }
  );
}
