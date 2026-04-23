// middleware/error.middleware.ts
// RULE: Global error handler. Converts AppError instances to unified JSON responses.

import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../utils/errors';
import { env } from '../config/env';

export function globalErrorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Handle our custom AppError instances
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      success: false,
      error: {
        message: error.message,
        code: error.constructor.name
          .replace('Error', '')
          .replace(/([A-Z])/g, '_$1')
          .toUpperCase()
          .replace(/^_/, ''),
        statusCode: error.statusCode,
      },
    });
  }

  // Handle Fastify validation errors (from Zod or schema validation)
  if ('validation' in error && error.validation) {
    return reply.code(400).send({
      success: false,
      error: {
        message: error.message,
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      },
    });
  }

  // Handle Fastify rate limit errors
  if ('statusCode' in error && error.statusCode === 429) {
    return reply.code(429).send({
      success: false,
      error: {
        message: 'Too many requests. Please slow down.',
        code: 'RATE_LIMIT_EXCEEDED',
        statusCode: 429,
      },
    });
  }

  // Unexpected errors — never expose internals to client
  request.log.error(error);

  return reply.code(500).send({
    success: false,
    error: {
      message: env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : error.message || 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
      statusCode: 500,
    },
  });
}
