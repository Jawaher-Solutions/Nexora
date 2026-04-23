// lib/prisma.ts
// RULE: This file ONLY initializes and exports the Prisma singleton.
// Uses the native PostgreSQL driver via @prisma/adapter-pg for Prisma 7 compatibility.

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Initialize the pg pool
const pool = new Pool({ connectionString: env.DATABASE_URL });
// Initialize the Prisma adapter
const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
