import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env';
import { globalErrorHandler } from './middleware/error.middleware';
import { registerRoutes } from './routes/index';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === 'development',
  });

  // Register plugins
  await app.register(cors);
  await app.register(helmet);

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  await app.register(rateLimit, {
    max: env.NODE_ENV === 'test' ? 1000 : 100,
    timeWindow: '1 minute',
  });

  app.get('/', async () => {
    return {
      name: 'Nexora Backend API',
      status: 'running',
      docs: {
        health: '/health',
        auth: '/api/v1/auth',
      },
      timestamp: new Date(),
    };
  });

  // Health check route
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date() };
  });

  // Register all API routes
  await registerRoutes(app);

  // Global Error Handler
  app.setErrorHandler(globalErrorHandler);

  return app;
}
