// types/fastify.d.ts
// Augments @fastify/jwt's FastifyJWT interface so that request.user
// resolves to { userId, role } instead of string | object | Buffer.
//
// The @fastify/jwt types already augment FastifyRequest.user to use
// fastifyJwt.UserType, which checks FastifyJWT for a `user` property.
// We just need to fill in the shape here.

import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      role: string;
    };
    user: {
      userId: string;
      role: string;
    };
  }
}
