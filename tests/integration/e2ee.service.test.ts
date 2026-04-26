import { prisma } from '../../src/lib/prisma';
import {
  uploadIdentityKey,
  uploadSignedPreKey,
  uploadPreKeys,
  getPreKeyBundle,
  recordKeySession,
  rotateSignedPreKey,
  getKeyStatus,
} from '../../src/services/e2ee.service';
import { createTestUser, cleanAll } from '../helpers/db';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../src/utils/errors';

const KEY = 'a'.repeat(44);
const SIG = 'b'.repeat(88);

describe('e2ee.service integration', () => {
  beforeEach(async () => {
    await cleanAll();
  });

  // ─── uploadIdentityKey ─────────────────────────────────────────────────────

  describe('uploadIdentityKey', () => {
    it('registers identity key for user without one', async () => {
      const user = await createTestUser();
      await prisma.user.update({ where: { id: user.id }, data: { publicKey: '' } });

      const result = await uploadIdentityKey(user.id, { identityPublicKey: KEY });
      expect(result.success).toBe(true);

      const u = await prisma.user.findUnique({ where: { id: user.id }, select: { publicKey: true } });
      expect(u!.publicKey).toBe(KEY);
    });

    it('throws ConflictError if identity key already set', async () => {
      const user = await createTestUser();
      await expect(uploadIdentityKey(user.id, { identityPublicKey: KEY })).rejects.toBeInstanceOf(ConflictError);
    });

    it('throws NotFoundError for non-existent user', async () => {
      await expect(uploadIdentityKey('00000000-0000-4000-8000-000000000099', { identityPublicKey: KEY })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ─── uploadSignedPreKey ────────────────────────────────────────────────────

  describe('uploadSignedPreKey', () => {
    it('uploads signed pre-key for user with no existing key', async () => {
      const user = await createTestUser();
      const result = await uploadSignedPreKey(user.id, { keyId: 1, publicKey: KEY, signature: SIG });
      expect(result.success).toBe(true);
      expect(result.keyId).toBe(1);

      const u = await prisma.user.findUnique({ where: { id: user.id }, select: { signedPreKeyId: true, signedPreKeyPublic: true, signedPreKeyCreatedAt: true } });
      expect(u!.signedPreKeyId).toBe(1);
      expect(u!.signedPreKeyPublic).toBe(KEY);
      expect(u!.signedPreKeyCreatedAt).toBeInstanceOf(Date);
    });

    it('archives old key to history when uploading new one', async () => {
      const user = await createTestUser();
      await uploadSignedPreKey(user.id, { keyId: 1, publicKey: KEY, signature: SIG });
      await uploadSignedPreKey(user.id, { keyId: 2, publicKey: 'c'.repeat(44), signature: 'd'.repeat(88) });

      const history = await prisma.signedPreKeyHistory.findMany({ where: { userId: user.id } });
      expect(history.length).toBe(1);
      expect(history[0].keyId).toBe(1);
    });

    it('throws ConflictError if keyId matches current active key', async () => {
      const user = await createTestUser();
      await uploadSignedPreKey(user.id, { keyId: 1, publicKey: KEY, signature: SIG });
      await expect(uploadSignedPreKey(user.id, { keyId: 1, publicKey: 'x'.repeat(44), signature: 'y'.repeat(88) })).rejects.toBeInstanceOf(ConflictError);
    });

    it('throws NotFoundError for non-existent user', async () => {
      await expect(uploadSignedPreKey('00000000-0000-4000-8000-000000000099', { keyId: 1, publicKey: KEY, signature: SIG })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ─── uploadPreKeys ─────────────────────────────────────────────────────────

  describe('uploadPreKeys', () => {
    it('uploads batch and increments count', async () => {
      const user = await createTestUser();
      const result = await uploadPreKeys(user.id, { preKeys: [{ id: 100, publicKey: KEY }, { id: 101, publicKey: KEY }, { id: 102, publicKey: KEY }] });
      expect(result.success).toBe(true);
      expect(result.uploaded).toBe(3);
      expect(result.remaining).toBe(3);
    });

    it('throws ValidationError for duplicate IDs in batch', async () => {
      const user = await createTestUser();
      await expect(uploadPreKeys(user.id, { preKeys: [{ id: 1, publicKey: KEY }, { id: 1, publicKey: KEY }] })).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ConflictError when key IDs already exist', async () => {
      const user = await createTestUser();
      await uploadPreKeys(user.id, { preKeys: [{ id: 1, publicKey: KEY }] });
      await expect(uploadPreKeys(user.id, { preKeys: [{ id: 1, publicKey: 'x'.repeat(44) }] })).rejects.toBeInstanceOf(ConflictError);
    });

    it('throws NotFoundError for non-existent user', async () => {
      await expect(uploadPreKeys('00000000-0000-4000-8000-000000000099', { preKeys: [{ id: 1, publicKey: KEY }] })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ─── getPreKeyBundle ───────────────────────────────────────────────────────

  describe('getPreKeyBundle', () => {
    it('returns full bundle and consumes one-time pre-key FIFO', async () => {
      const req = await createTestUser();
      const tgt = await createTestUser();
      await uploadSignedPreKey(tgt.id, { keyId: 1, publicKey: KEY, signature: SIG });
      await uploadPreKeys(tgt.id, { preKeys: [{ id: 10, publicKey: 'k10'.padEnd(44, 'x') }, { id: 20, publicKey: 'k20'.padEnd(44, 'x') }] });

      const bundle = await getPreKeyBundle(req.id, tgt.id);
      expect(bundle.identityKey).toBe(tgt.publicKey);
      expect(bundle.signedPreKey.keyId).toBe(1);
      expect(bundle.oneTimePreKey).not.toBeNull();
      expect(bundle.oneTimePreKey!.keyId).toBe(10);
      expect(bundle.recipientId).toBe(tgt.id);

      const remaining = await prisma.preKey.findMany({ where: { userId: tgt.id } });
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe(20);
    });

    it('returns null oneTimePreKey when none available', async () => {
      const req = await createTestUser();
      const tgt = await createTestUser();
      await uploadSignedPreKey(tgt.id, { keyId: 1, publicKey: KEY, signature: SIG });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bundle = await getPreKeyBundle(req.id, tgt.id);
      expect(bundle.oneTimePreKey).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no one-time pre-keys'));
      warnSpy.mockRestore();
    });

    it('throws ValidationError requesting own bundle', async () => {
      const u = await createTestUser();
      await expect(getPreKeyBundle(u.id, u.id)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError for non-existent user', async () => {
      const u = await createTestUser();
      await expect(getPreKeyBundle(u.id, '00000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError for banned user', async () => {
      const req = await createTestUser();
      const banned = await createTestUser({ isBanned: true });
      await expect(getPreKeyBundle(req.id, banned.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ValidationError when target has no identity key', async () => {
      const req = await createTestUser();
      const tgt = await createTestUser();
      await prisma.user.update({ where: { id: tgt.id }, data: { publicKey: '' } });
      await expect(getPreKeyBundle(req.id, tgt.id)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when target has no signed pre-key', async () => {
      const req = await createTestUser();
      const tgt = await createTestUser();
      await expect(getPreKeyBundle(req.id, tgt.id)).rejects.toBeInstanceOf(ValidationError);
    });
  });

  // ─── recordKeySession ──────────────────────────────────────────────────────

  describe('recordKeySession', () => {
    it('creates a session record', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      const result = await recordKeySession(u1.id, { recipientId: u2.id, usedPreKeyId: 10, usedSignedPreKeyId: 1 });
      expect(result.success).toBe(true);

      const session = await prisma.keySession.findUnique({ where: { id: result.sessionId } });
      expect(session!.initiatorId).toBe(u1.id);
      expect(session!.usedPreKeyId).toBe(10);
    });

    it('creates session with null key IDs', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      const result = await recordKeySession(u1.id, { recipientId: u2.id });
      const session = await prisma.keySession.findUnique({ where: { id: result.sessionId } });
      expect(session!.usedPreKeyId).toBeNull();
      expect(session!.usedSignedPreKeyId).toBeNull();
    });

    it('throws ValidationError for self-session', async () => {
      const u = await createTestUser();
      await expect(recordKeySession(u.id, { recipientId: u.id })).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError for non-existent recipient', async () => {
      const u = await createTestUser();
      await expect(recordKeySession(u.id, { recipientId: '00000000-0000-4000-8000-000000000099' })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ─── rotateSignedPreKey ────────────────────────────────────────────────────

  describe('rotateSignedPreKey', () => {
    it('rotates and archives old key with revokedAt', async () => {
      const user = await createTestUser();
      await uploadSignedPreKey(user.id, { keyId: 1, publicKey: KEY, signature: SIG });

      const result = await rotateSignedPreKey(user.id, { keyId: 2, publicKey: 'c'.repeat(44), signature: 'd'.repeat(88) });
      expect(result.success).toBe(true);
      expect(result.newKeyId).toBe(2);

      const hist = await prisma.signedPreKeyHistory.findMany({ where: { userId: user.id, revokedAt: { not: null } } });
      expect(hist.length).toBe(1);
      expect(hist[0].keyId).toBe(1);
    });

    it('allows rotation when no previous key exists', async () => {
      const user = await createTestUser();
      const result = await rotateSignedPreKey(user.id, { keyId: 1, publicKey: KEY, signature: SIG });
      expect(result.success).toBe(true);
    });

    it('throws ConflictError rotating to same keyId', async () => {
      const user = await createTestUser();
      await uploadSignedPreKey(user.id, { keyId: 1, publicKey: KEY, signature: SIG });
      await expect(rotateSignedPreKey(user.id, { keyId: 1, publicKey: 'x'.repeat(44), signature: 'y'.repeat(88) })).rejects.toBeInstanceOf(ConflictError);
    });

    it('throws NotFoundError for non-existent user', async () => {
      await expect(rotateSignedPreKey('00000000-0000-4000-8000-000000000099', { keyId: 1, publicKey: KEY, signature: SIG })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ─── getKeyStatus ──────────────────────────────────────────────────────────

  describe('getKeyStatus', () => {
    it('returns full status for configured user', async () => {
      const user = await createTestUser();
      await uploadSignedPreKey(user.id, { keyId: 1, publicKey: KEY, signature: SIG });
      await uploadPreKeys(user.id, { preKeys: Array.from({ length: 15 }, (_, i) => ({ id: i + 1, publicKey: KEY })) });

      const status = await getKeyStatus(user.id);
      expect(status.hasIdentityKey).toBe(true);
      expect(status.hasSignedPreKey).toBe(true);
      expect(status.oneTimePreKeysCount).toBe(15);
      expect(status.needsPreKeyUpload).toBe(false);
      expect(status.needsKeyRotation).toBe(false);
      expect(status.daysSinceRotation).toBe(0);
      expect(status.signedPreKeyId).toBe(1);
    });

    it('reports needsPreKeyUpload when count < 10', async () => {
      const user = await createTestUser();
      await uploadPreKeys(user.id, { preKeys: [{ id: 1, publicKey: KEY }] });
      const status = await getKeyStatus(user.id);
      expect(status.needsPreKeyUpload).toBe(true);
    });

    it('reports hasIdentityKey false when empty', async () => {
      const user = await createTestUser();
      await prisma.user.update({ where: { id: user.id }, data: { publicKey: '' } });
      const status = await getKeyStatus(user.id);
      expect(status.hasIdentityKey).toBe(false);
    });

    it('reports needsKeyRotation when key > 30 days old', async () => {
      const user = await createTestUser();
      await uploadSignedPreKey(user.id, { keyId: 1, publicKey: KEY, signature: SIG });
      await prisma.user.update({ where: { id: user.id }, data: { signedPreKeyCreatedAt: new Date(Date.now() - 31 * 86400000) } });

      const status = await getKeyStatus(user.id);
      expect(status.needsKeyRotation).toBe(true);
      expect(status.daysSinceRotation).toBeGreaterThanOrEqual(31);
    });

    it('throws NotFoundError for non-existent user', async () => {
      await expect(getKeyStatus('00000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
