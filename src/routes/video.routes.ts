import { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import {
  confirmUpload,
  deleteVideo,
  flagVideo,
  getFeed,
  getUserVideos,
  getVideoById,
  likeVideo,
  requestUpload,
  unlikeVideo,
} from '../services/video.service';
import {
  confirmUploadSchema,
  feedQuerySchema,
  flagVideoSchema,
  requestUploadSchema,
} from '../validators/video.validators';
import { ValidationError } from '../utils/errors';

function toValidationError(error: unknown): ValidationError {
  if (error instanceof ZodError) {
    return new ValidationError(error.issues.map((issue) => issue.message).join(', '));
  }

  return new ValidationError('Invalid request data');
}

export async function videoRoutes(app: FastifyInstance) {
  app.post('/upload/request', { preHandler: [authenticate] }, async (request, reply) => {
    let body;
    try {
      body = requestUploadSchema.parse(request.body);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await requestUpload(request.user.userId, body);
    return reply.code(201).send({ success: true, data: result });
  });

  app.post('/upload/confirm', { preHandler: [authenticate] }, async (request, reply) => {
    let body;
    try {
      body = confirmUploadSchema.parse(request.body);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await confirmUpload(body.videoId, request.user.userId);
    return reply.code(200).send({ success: true, data: result });
  });

  app.get('/feed', { preHandler: [authenticate] }, async (request, reply) => {
    let query;
    try {
      query = feedQuerySchema.parse(request.query);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await getFeed(request.user.userId, query.page, query.limit);
    return reply.code(200).send({ success: true, data: result });
  });

  app.get('/my-videos', { preHandler: [authenticate] }, async (request, reply) => {
    let query;
    try {
      query = feedQuerySchema.parse(request.query);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await getUserVideos(request.user.userId, query.page, query.limit);
    return reply.code(200).send({ success: true, data: result });
  });

  app.get('/:videoId', { preHandler: [authenticate] }, async (request, reply) => {
    const params = request.params as { videoId: string };
    const result = await getVideoById(params.videoId, request.user.userId);
    return reply.code(200).send({ success: true, data: result });
  });

  app.delete('/:videoId', { preHandler: [authenticate] }, async (request, reply) => {
    const params = request.params as { videoId: string };
    const result = await deleteVideo(params.videoId, request.user.userId);
    return reply.code(200).send({ success: true, data: result });
  });

  app.post('/:videoId/like', { preHandler: [authenticate] }, async (request, reply) => {
    const params = request.params as { videoId: string };
    const result = await likeVideo(request.user.userId, params.videoId);
    return reply.code(200).send({ success: true, data: result });
  });

  app.delete('/:videoId/like', { preHandler: [authenticate] }, async (request, reply) => {
    const params = request.params as { videoId: string };
    const result = await unlikeVideo(request.user.userId, params.videoId);
    return reply.code(200).send({ success: true, data: result });
  });

  app.post('/:videoId/flag', { preHandler: [authenticate] }, async (request, reply) => {
    const params = request.params as { videoId: string };
    let body;

    try {
      body = flagVideoSchema.parse(request.body);
    } catch (error: unknown) {
      throw toValidationError(error);
    }

    const result = await flagVideo(request.user.userId, params.videoId, body.reason);
    return reply.code(200).send({ success: true, data: result });
  });
}
