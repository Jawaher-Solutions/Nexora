import { prisma } from '../../src/lib/prisma';
import { createTestUser, createTestVideo } from '../helpers/db';

let capturedProcessor: undefined | ((job: { data: { videoId: string } }) => Promise<void>);

const analyzeContentMock = vi.fn();
vi.mock('../../src/lib/gemini', () => ({
  analyzeContent: (...args: any[]) => analyzeContentMock(...args),
}));

vi.mock('bullmq', () => {
  class Worker {
    constructor(_name: string, processor: any, _opts: any) {
      capturedProcessor = processor;
    }
    on() {
      return this;
    }
  }

  return { Worker };
});

describe('moderation worker logic', () => {
  beforeAll(async () => {
    // Import after mocks are set; it will instantiate the Worker and capture the processor.
    // @ts-ignore — dynamic import path is valid at runtime; TS language server can't resolve it statically
    await import('../../src/jobs/moderation.worker');

    if (!capturedProcessor) {
      throw new Error('Failed to capture moderation worker processor');
    }
  });

  beforeEach(async () => {
    analyzeContentMock.mockReset();

    await prisma.moderationLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.video.deleteMany();
    await prisma.user.deleteMany();
  });

  it('auto-approves video when maxScore < 40', async () => {
    const user = await createTestUser();
    const video = await createTestVideo(user.id, { status: 'PENDING' });

    analyzeContentMock.mockResolvedValueOnce({
      scores: { nudity: 5, violence: 3, hateSpeech: 2, illegal: 1 },
      maxScore: 15,
      summary: 'Clean content',
    });

    await capturedProcessor!({ data: { videoId: video.id } });

    const updated = await prisma.video.findUnique({ where: { id: video.id } });
    expect(updated?.status).toBe('APPROVED');

    const log = await prisma.moderationLog.findFirst({ where: { videoId: video.id } });
    expect(log?.decision).toBe('AUTO_APPROVED');

    const notif = await prisma.notification.findFirst({ where: { userId: user.id } });
    expect(notif?.type).toBe('MODERATION');
  });

  it('escalates video when maxScore between 40-69', async () => {
    const user = await createTestUser();
    const video = await createTestVideo(user.id, { status: 'PENDING' });

    analyzeContentMock.mockResolvedValueOnce({
      scores: { nudity: 50, violence: 10, hateSpeech: 0, illegal: 0 },
      maxScore: 55,
      summary: 'Needs review',
    });

    await capturedProcessor!({ data: { videoId: video.id } });

    const updated = await prisma.video.findUnique({ where: { id: video.id } });
    expect(updated?.status).toBe('PENDING_REVIEW');

    const log = await prisma.moderationLog.findFirst({ where: { videoId: video.id } });
    expect(log?.decision).toBe('ESCALATED');
  });

  it('auto-rejects video when maxScore >= 70', async () => {
    const user = await createTestUser();
    const video = await createTestVideo(user.id, { status: 'PENDING' });

    analyzeContentMock.mockResolvedValueOnce({
      scores: { nudity: 90, violence: 10, hateSpeech: 0, illegal: 0 },
      maxScore: 85,
      summary: 'Unsafe',
    });

    await capturedProcessor!({ data: { videoId: video.id } });

    const updated = await prisma.video.findUnique({ where: { id: video.id } });
    expect(updated?.status).toBe('REJECTED');

    const log = await prisma.moderationLog.findFirst({ where: { videoId: video.id } });
    expect(log?.decision).toBe('AUTO_REJECTED');
  });

  it('skips already-processed videos', async () => {
    const user = await createTestUser();
    const video = await createTestVideo(user.id, { status: 'APPROVED' });

    analyzeContentMock.mockResolvedValueOnce({
      scores: { nudity: 0, violence: 0, hateSpeech: 0, illegal: 0 },
      maxScore: 0,
      summary: 'N/A',
    });

    await capturedProcessor!({ data: { videoId: video.id } });

    expect(analyzeContentMock).not.toHaveBeenCalled();
  });

  it('throws error and allows retry when Gemini fails', async () => {
    const user = await createTestUser();
    const video = await createTestVideo(user.id, { status: 'PENDING' });

    analyzeContentMock.mockRejectedValueOnce(new Error('Gemini down'));

    await expect(capturedProcessor!({ data: { videoId: video.id } })).rejects.toThrow('Gemini down');
  });
});
