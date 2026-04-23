// types/fastify.d.ts
// Augments FastifyJWT with user property set by auth middleware.

import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      userId: string;
      role: string;
    };
  }
}
