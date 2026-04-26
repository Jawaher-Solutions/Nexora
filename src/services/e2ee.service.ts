// services/e2ee.service.ts
// E2EE key management service — WhatsApp/Signal pre-key bundle model.
// RULE: The server is a blind relay. Private keys NEVER leave the client.
//       This service stores ONLY public key material and encrypted ciphertext.
//       Never log, inspect, or derive any key material.

import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import type {
  UploadIdentityKeyInput,
  UploadSignedPreKeyInput,
  UploadPreKeysInput,
  RecordKeySessionInput,
  RotateSignedPreKeyInput,
} from '../validators/e2ee.validators';

// ─── Identity Key ────────────────────────────────────────────────────────────

/**
 * Registers the user's long-term identity public key (X25519 or Ed25519).
 * This is a one-time operation — once set, use key rotation to change it.
 */
export async function uploadIdentityKey(
  userId: string,
  input: UploadIdentityKeyInput
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, publicKey: true },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.publicKey) {
    throw new ConflictError(
      'Identity key already registered. Use key rotation endpoint to change it'
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { publicKey: input.identityPublicKey },
  });

  return { success: true, message: 'Identity key registered successfully' };
}

// ─── Signed Pre-Key ──────────────────────────────────────────────────────────

/**
 * Uploads or replaces the user's signed pre-key. If an existing signed pre-key
 * is active, it is archived to SignedPreKeyHistory before replacement.
 */
export async function uploadSignedPreKey(
  userId: string,
  input: UploadSignedPreKeyInput
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      signedPreKeyId: true,
      signedPreKeyPublic: true,
      signedPreKeySignature: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.signedPreKeyId === input.keyId) {
    throw new ConflictError(
      'A signed pre-key with this ID is already active'
    );
  }

  await prisma.$transaction(async (tx) => {
    // Archive the old signed pre-key if one exists
    if (user.signedPreKeyId !== null && user.signedPreKeyId !== undefined) {
      await tx.signedPreKeyHistory.create({
        data: {
          userId,
          keyId: user.signedPreKeyId,
          publicKey: user.signedPreKeyPublic!,
          signature: user.signedPreKeySignature!,
        },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        signedPreKeyId: input.keyId,
        signedPreKeyPublic: input.publicKey,
        signedPreKeySignature: input.signature,
        signedPreKeyCreatedAt: new Date(),
      },
    });
  });

  return { success: true, keyId: input.keyId };
}

// ─── One-Time Pre-Keys ───────────────────────────────────────────────────────

/**
 * Uploads a batch of one-time pre-keys (public only). Each pre-key is consumed
 * exactly once when another user fetches this user's pre-key bundle.
 */
export async function uploadPreKeys(
  userId: string,
  input: UploadPreKeysInput
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  // Check for duplicate IDs within the upload batch
  const ids = input.preKeys.map((k) => k.id);
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError('Duplicate pre-key IDs in upload batch');
  }

  // Check for collisions with existing pre-keys
  const existing = await prisma.preKey.findMany({
    where: { userId, id: { in: ids } },
    select: { id: true },
  });

  if (existing.length > 0) {
    throw new ConflictError(
      `Pre-key IDs ${existing.map((k) => k.id).join(', ')}`
    );
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    await tx.preKey.createMany({
      data: input.preKeys.map((k) => ({
        id: k.id,
        userId,
        publicKey: k.publicKey,
      })),
    });

    return tx.user.update({
      where: { id: userId },
      data: { preKeysCount: { increment: input.preKeys.length } },
      select: { preKeysCount: true },
    });
  });

  return {
    success: true,
    uploaded: input.preKeys.length,
    remaining: updatedUser.preKeysCount,
  };
}

// ─── Pre-Key Bundle ──────────────────────────────────────────────────────────

/**
 * Core PFS endpoint. The client calls this before sending the first message
 * to a user. Returns everything needed to establish an encrypted session
 * without the server being able to derive the session key.
 *
 * One-time pre-key is consumed (deleted) on retrieval — FIFO order.
 */
export async function getPreKeyBundle(
  requestingUserId: string,
  targetUserId: string
) {
  if (requestingUserId === targetUserId) {
    throw new ValidationError('Cannot fetch your own pre-key bundle');
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      publicKey: true,
      signedPreKeyId: true,
      signedPreKeyPublic: true,
      signedPreKeySignature: true,
      signedPreKeyCreatedAt: true,
      preKeysCount: true,
      isBanned: true,
    },
  });

  if (!target || target.isBanned) {
    throw new NotFoundError('User');
  }

  if (!target.publicKey) {
    throw new ValidationError(
      'This user has not registered their encryption keys yet'
    );
  }

  if (!target.signedPreKeyPublic) {
    throw new ValidationError(
      'This user has not uploaded a signed pre-key yet'
    );
  }

  // Fetch and consume ONE one-time pre-key (FIFO by ID ascending)
  let oneTimePreKey: { keyId: number; publicKey: string } | null = null;
  const preKey = await prisma.preKey.findFirst({
    where: { userId: targetUserId },
    orderBy: { id: 'asc' },
  });

  if (preKey) {
    await prisma.$transaction(async (tx) => {
      await tx.preKey.delete({
        where: { id_userId: { id: preKey.id, userId: targetUserId } },
      });
      await tx.user.update({
        where: { id: targetUserId },
        data: { preKeysCount: { decrement: 1 } },
      });
    });
    oneTimePreKey = { keyId: preKey.id, publicKey: preKey.publicKey };
  } else {
    console.warn(
      `[E2EE] User ${targetUserId} has no one-time pre-keys remaining. Session will use signed pre-key only.`
    );
  }

  return {
    identityKey: target.publicKey,
    signedPreKey: {
      keyId: target.signedPreKeyId!,
      publicKey: target.signedPreKeyPublic,
      signature: target.signedPreKeySignature!,
    },
    oneTimePreKey,
    preKeysRemaining: Math.max(0, (target.preKeysCount ?? 0) - (preKey ? 1 : 0)),
    recipientId: target.id,
    username: target.username,
  };
}

// ─── Key Session ─────────────────────────────────────────────────────────────

/**
 * Called by the initiator AFTER successfully establishing an encrypted session
 * locally. This is for audit/debugging only — no keys are stored here,
 * only which key IDs were used.
 */
export async function recordKeySession(
  initiatorId: string,
  input: RecordKeySessionInput
) {
  if (initiatorId === input.recipientId) {
    throw new ValidationError('Cannot record session with yourself');
  }

  const recipient = await prisma.user.findUnique({
    where: { id: input.recipientId },
    select: { id: true },
  });

  if (!recipient) {
    throw new NotFoundError('User');
  }

  const session = await prisma.keySession.create({
    data: {
      initiatorId,
      recipientId: input.recipientId,
      usedPreKeyId: input.usedPreKeyId ?? null,
      usedSignedPreKeyId: input.usedSignedPreKeyId ?? null,
    },
  });

  return { success: true, sessionId: session.id };
}

// ─── Signed Pre-Key Rotation ─────────────────────────────────────────────────

/**
 * Rotates the user's signed pre-key. Old key is archived to SignedPreKeyHistory
 * with a revokedAt timestamp. Client should call this every 7-30 days.
 * Old private keys remain on the client for decrypting older messages.
 */
export async function rotateSignedPreKey(
  userId: string,
  input: RotateSignedPreKeyInput
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      signedPreKeyId: true,
      signedPreKeyPublic: true,
      signedPreKeySignature: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.signedPreKeyId === input.keyId) {
    throw new ConflictError('Cannot rotate to the same key ID');
  }

  await prisma.$transaction(async (tx) => {
    // Archive the old signed pre-key if one exists
    if (user.signedPreKeyId !== null && user.signedPreKeyId !== undefined) {
      await tx.signedPreKeyHistory.create({
        data: {
          userId,
          keyId: user.signedPreKeyId,
          publicKey: user.signedPreKeyPublic!,
          signature: user.signedPreKeySignature!,
          revokedAt: new Date(),
        },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        signedPreKeyId: input.keyId,
        signedPreKeyPublic: input.publicKey,
        signedPreKeySignature: input.signature,
        signedPreKeyCreatedAt: new Date(),
      },
    });
  });

  return {
    success: true,
    newKeyId: input.keyId,
    rotatedAt: new Date().toISOString(),
  };
}

// ─── Key Status ──────────────────────────────────────────────────────────────

/**
 * Returns the current E2EE key status for the authenticated user.
 * Client calls this periodically to know when to upload more pre-keys.
 * Threshold: if preKeysCount < 10, client should upload a new batch.
 */
export async function getKeyStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      publicKey: true,
      signedPreKeyId: true,
      signedPreKeyCreatedAt: true,
      preKeysCount: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  const daysSinceRotation = user.signedPreKeyCreatedAt
    ? Math.floor(
        (Date.now() - user.signedPreKeyCreatedAt.getTime()) / 86400000
      )
    : null;

  return {
    hasIdentityKey: !!user.publicKey,
    hasSignedPreKey: !!user.signedPreKeyId,
    oneTimePreKeysCount: user.preKeysCount,
    needsPreKeyUpload: user.preKeysCount < 10,
    needsKeyRotation:
      daysSinceRotation !== null && daysSinceRotation > 30,
    daysSinceRotation,
    signedPreKeyId: user.signedPreKeyId ?? null,
  };
}
