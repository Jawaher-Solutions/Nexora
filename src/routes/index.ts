// routes/index.ts
// Registers all route plugins under /api/v1

import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.routes';
import { videoRoutes } from './video.routes';
import { adminRoutes } from './admin.routes';
import { socialRoutes } from './social.routes';
import { messageRoutes } from './message.routes';
import { e2eeRoutes } from './e2ee.routes';
import { startWorkers } from '../jobs';

export async function registerRoutes(app: FastifyInstance) {
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(videoRoutes, { prefix: '/api/v1/videos' });
  app.register(adminRoutes, { prefix: '/api/v1/admin' });

  app.register(socialRoutes,  { prefix: '/api/v1/social' });
  app.register(messageRoutes, { prefix: '/api/v1/messages' });
  app.register(e2eeRoutes,    { prefix: '/api/v1/e2ee' });

  startWorkers();
}
