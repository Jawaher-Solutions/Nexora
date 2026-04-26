import { prisma } from '../../src/lib/prisma';
import { cleanAll } from '../helpers/db';
import {
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
} from '../../src/services/auth.service';
import { ConflictError, UnauthorizedError } from '../../src/utils/errors';

describe('auth.service integration', () => {
  beforeEach(async () => {
    await cleanAll();
  });

  describe('registerUser', () => {
    it('registers a new user and returns tokens', async () => {
      const result = await registerUser({
        username: 'user_1',
        email: 'user1@example.com',
        password: 'Password123!',
        publicKey: 'pk',
      });

      expect(result.user.email).toBe('user1@example.com');
      expect(result.tokens.refreshToken).toBeTruthy();
      expect(result.tokens.accessTokenPayload.userId).toBe(result.user.id);
    });

    it('throws ConflictError for duplicate email', async () => {
      await registerUser({
        username: 'user_1',
        email: 'dup@example.com',
        password: 'Password123!',
        publicKey: 'pk',
      });

      await expect(
        registerUser({
          username: 'user_2',
          email: 'dup@example.com',
          password: 'Password123!',
          publicKey: 'pk',
        })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('throws ConflictError for duplicate username', async () => {
      await registerUser({
        username: 'dup_user',
        email: 'a@example.com',
        password: 'Password123!',
        publicKey: 'pk',
      });

      await expect(
        registerUser({
          username: 'dup_user',
          email: 'b@example.com',
          password: 'Password123!',
          publicKey: 'pk',
        })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('saves a RefreshToken to DB', async () => {
      const result = await registerUser({
        username: 'user_1',
        email: 'user1@example.com',
        password: 'Password123!',
        publicKey: 'pk',
      });

      const tokens = await prisma.refreshToken.findMany({ where: { userId: result.user.id } });
      expect(tokens.length).toBe(1);
    });
  });

  describe('loginUser', () => {
    it('returns tokens for valid credentials', async () => {
      await registerUser({
        username: 'user_1',
        email: 'user1@example.com',
        password: 'Password123!',
        publicKey: 'pk',
      });

      const result = await loginUser({
        email: 'user1@example.com',
        password: 'Password123!',
      });

      expect(result.tokens.refreshToken).toBeTruthy();
      expect(result.user.email).toBe('user1@example.com');
    });

    it('throws UnauthorizedError for unknown email', async () => {
      await expect(
        loginUser({
          email: 'missing@example.com',
          password: 'Password123!',
        })
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('throws UnauthorizedError for wrong password', async () => {
      await registerUser({
        username: 'user_1',
        email: 'user1@example.com',
        password: 'Password123!',
        publicKey: 'pk',
      });

      await expect(
        loginUser({
          email: 'user1@example.com',
          password: 'WrongPassword!',
        })
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('throws UnauthorizedError when user is banned', async () => {
      const user = await registerUser({
        username: 'user_1',
        email: 'user1@example.com',
        password: 'Password123!',
        publicKey: 'pk',
      });

      await prisma.user.update({
        where: { id: user.user.id },
        data: { isBanned: true },
      });

      await expect(
        loginUser({
          email: 'user1@example.com',
          password: 'Password123!',
        })
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe('refreshAccessToken', () => {
    it('returns new tokens and deletes old refresh token', async () => {
      const reg = await registerUser({
        username: 'user_1',
        email: 'user1@example.com',
        password: 'Password123!',
        publicKey: 'pk',
      });

      const oldToken = reg.tokens.refreshToken;
      const refreshed = await refreshAccessToken(oldToken);

      expect(refreshed.refreshToken).toBeTruthy();
      expect(refreshed.refreshToken).not.toBe(oldToken);

      const oldInDb = await prisma.refreshToken.findUnique({ where: { token: oldToken } });
      expect(oldInDb).toBeNull();
    });

    it('throws UnauthorizedError for non-existent refresh token', async () => {
      await expect(refreshAccessToken('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
        UnauthorizedError
      );
    });

    it('throws UnauthorizedError for expired refresh token', async () => {
      const reg = await registerUser({
        username: 'user_1',
        email: 'user1@example.com',
        password: 'Password123!',
        publicKey: 'pk',
      });

      await prisma.refreshToken.update({
        where: { token: reg.tokens.refreshToken },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await expect(refreshAccessToken(reg.tokens.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe('logoutUser', () => {
    it('deletes refresh token from DB', async () => {
      const reg = await registerUser({
        username: 'user_1',
        email: 'user1@example.com',
        password: 'Password123!',
        publicKey: 'pk',
      });

      const token = reg.tokens.refreshToken;
      await logoutUser(reg.user.id, token);

      const inDb = await prisma.refreshToken.findUnique({ where: { token } });
      expect(inDb).toBeNull();
    });

    it('does not throw for non-existent token', async () => {
      const reg = await registerUser({
        username: 'user_1',
        email: 'user1@example.com',
        password: 'Password123!',
        publicKey: 'pk',
      });

      await expect(logoutUser(reg.user.id, '00000000-0000-0000-0000-000000000000')).resolves.toBeTruthy();
    });
  });
});
