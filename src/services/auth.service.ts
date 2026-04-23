// services/auth.service.ts
// RULE: Business logic only. No HTTP, no req/reply. Throws AppError subclasses.

import { prisma } from '../lib/prisma';
import { hashPassword, comparePassword } from '../utils/hash';
import { generateRefreshToken, getRefreshTokenExpiry } from '../utils/tokens';
import { ConflictError, UnauthorizedError, NotFoundError } from '../utils/errors';
import { REFRESH_TOKEN_EXPIRY_DAYS } from '../config/constants';
import type { RegisterInput, LoginInput } from '../validators/auth.validators';

export interface AuthTokens {
  accessTokenPayload: { userId: string; role: string };
  refreshToken: string;
  refreshTokenExpiry: Date;
}

/**
 * Register a new user.
 */
export async function registerUser(input: RegisterInput) {
  // Check for existing username
  const existingUsername = await prisma.user.findUnique({
    where: { username: input.username },
  });
  if (existingUsername) throw new ConflictError('Username');

  // Check for existing email
  const existingEmail = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existingEmail) throw new ConflictError('Email');

  // Hash password
  const passwordHash = await hashPassword(input.password);

  // Create user
  const user = await prisma.user.create({
    data: {
      username: input.username,
      email: input.email,
      passwordHash,
      publicKey: input.publicKey,
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      isVerified: true,
      createdAt: true,
    },
  });

  // Generate tokens
  const refreshToken = generateRefreshToken();
  const refreshTokenExpiry = getRefreshTokenExpiry(REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: refreshTokenExpiry,
    },
  });

  return {
    user,
    tokens: {
      accessTokenPayload: { userId: user.id, role: user.role },
      refreshToken,
      refreshTokenExpiry,
    } as AuthTokens,
  };
}

/**
 * Login with email and password.
 */
export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (!user) throw new UnauthorizedError('Invalid email or password');

  if (user.isBanned) throw new UnauthorizedError('Account is banned');

  const isPasswordValid = await comparePassword(input.password, user.passwordHash);
  if (!isPasswordValid) throw new UnauthorizedError('Invalid email or password');

  // Generate tokens
  const refreshToken = generateRefreshToken();
  const refreshTokenExpiry = getRefreshTokenExpiry(REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: refreshTokenExpiry,
    },
  });

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      avatarUrl: user.avatarUrl,
    },
    tokens: {
      accessTokenPayload: { userId: user.id, role: user.role },
      refreshToken,
      refreshTokenExpiry,
    } as AuthTokens,
  };
}

/**
 * Refresh access token using a valid refresh token.
 * Implements token rotation: old token is deleted, new one is issued.
 */
export async function refreshAccessToken(token: string) {
  const existingToken = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!existingToken) throw new UnauthorizedError('Invalid refresh token');
  if (existingToken.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: existingToken.id } });
    throw new UnauthorizedError('Refresh token has expired');
  }

  if (existingToken.user.isBanned) throw new UnauthorizedError('Account is banned');

  // Token rotation: delete old, create new
  await prisma.refreshToken.delete({ where: { id: existingToken.id } });

  const newRefreshToken = generateRefreshToken();
  const newExpiry = getRefreshTokenExpiry(REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      userId: existingToken.userId,
      token: newRefreshToken,
      expiresAt: newExpiry,
    },
  });

  return {
    accessTokenPayload: {
      userId: existingToken.userId,
      role: existingToken.user.role,
    },
    refreshToken: newRefreshToken,
    refreshTokenExpiry: newExpiry,
  } as AuthTokens;
}

/**
 * Logout: delete the specific refresh token.
 */
export async function logoutUser(userId: string, refreshToken: string) {
  const token = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });

  if (token && token.userId === userId) {
    await prisma.refreshToken.delete({ where: { id: token.id } });
  }

  return { message: 'Logged out successfully' };
}
