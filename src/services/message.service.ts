// services/message.service.ts
// E2EE Messaging service.
// RULE: This service stores and retrieves ONLY ciphertext.
//       It never decrypts, validates, or inspects encryptedContent beyond length.
//       Never log encryptedContent.

import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../utils/errors';
import { paginate as getPaginationParams } from '../utils/pagination';
import type { SendMessageInput } from '../validators/social.validators';

// ─── Public Key Retrieval ─────────────────────────────────────────────────────

/**
 * Returns the recipient's public key so the client can encrypt the message
 * before calling sendMessage. Must be called before sendMessage.
 */
export async function getRecipientPublicKey(requestingUserId: string, recipientId: string) {
  // TODO: check if requesting user has blocked recipient
  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { id: true, username: true, publicKey: true, isBanned: true },
  });

  if (!recipient || recipient.isBanned) {
    throw new NotFoundError('User');
  }

  return {
    userId: recipient.id,
    username: recipient.username,
    publicKey: recipient.publicKey,
  };
}

// ─── Send Message ─────────────────────────────────────────────────────────────

export async function sendMessage(senderId: string, input: SendMessageInput) {
  if (senderId === input.recipientId) {
    throw new ValidationError('You cannot message yourself');
  }

  const recipient = await prisma.user.findUnique({
    where: { id: input.recipientId },
    select: { id: true, isBanned: true },
  });

  if (!recipient || recipient.isBanned) {
    throw new NotFoundError('User');
  }

  const message = await prisma.message.create({
    data: {
      senderId,
      recipientId: input.recipientId,
      encryptedContent: input.encryptedContent,
    },
  });

  // Do NOT return encryptedContent — sender already has it
  return {
    messageId: message.id,
    createdAt: message.createdAt,
  };
}

// ─── Get Conversation ─────────────────────────────────────────────────────────

export async function getConversation(
  userId: string,
  otherUserId: string,
  page: number,
  limit: number
) {
  // Only select id and isBanned — never expose passwordHash or other sensitive fields
  const otherUser = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, isBanned: true },
  });

  if (!otherUser || otherUser.isBanned) {
    throw new NotFoundError('User');
  }

  const { skip, take } = getPaginationParams(page, limit);

  const conversationFilter = {
    OR: [
      { senderId: userId, recipientId: otherUserId },
      { senderId: otherUserId, recipientId: userId },
    ],
  };

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: conversationFilter,
      orderBy: { createdAt: 'asc' },
      skip,
      take,
    }),
    prisma.message.count({ where: conversationFilter }),
  ]);

  // Fire-and-forget: mark incoming messages as read, log any DB errors
  prisma.message.updateMany({
    where: { senderId: otherUserId, recipientId: userId, isRead: false },
    data: { isRead: true },
  }).catch((err: unknown) => {
    console.error('[message.service] Failed to mark messages as read', {
      err,
      userId,
      otherUserId,
    });
  });

  return {
    messages,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─── Conversation List ────────────────────────────────────────────────────────

export async function getConversationList(userId: string, page = 1, limit = 20) {
  const [sentTo, receivedFrom] = await Promise.all([
    prisma.message.findMany({
      where: { senderId: userId },
      select: { recipientId: true },
      distinct: ['recipientId'],
    }),
    prisma.message.findMany({
      where: { recipientId: userId },
      select: { senderId: true },
      distinct: ['senderId'],
    }),
  ]);

  // Build a deduplicated set of peer user IDs, excluding self
  const peerIds = new Set<string>();
  for (const m of sentTo) {
    if (m.recipientId !== userId) peerIds.add(m.recipientId);
  }
  for (const m of receivedFrom) {
    if (m.senderId !== userId) peerIds.add(m.senderId);
  }

  // Apply pagination to the peer list
  const allPeerIds = Array.from(peerIds);
  const total = allPeerIds.length;
  const skip = (page - 1) * limit;
  const pagedPeerIds = allPeerIds.slice(skip, skip + limit);

  const conversationEntries = await Promise.all(
    pagedPeerIds.map(async (peerId) => {
      const [user, lastMessage] = await Promise.all([
        prisma.user.findUnique({
          where: { id: peerId },
          select: { id: true, username: true, avatarUrl: true },
        }),
        prisma.message.findFirst({
          where: {
            OR: [
              { senderId: userId, recipientId: peerId },
              { senderId: peerId, recipientId: userId },
            ],
          },
          orderBy: { createdAt: 'desc' },
          select: { encryptedContent: true, createdAt: true, isRead: true, senderId: true },
        }),
      ]);

      if (!user || !lastMessage) return null;

      return {
        user,
        lastMessage: {
          encryptedContent: lastMessage.encryptedContent,
          createdAt: lastMessage.createdAt,
          isRead: lastMessage.isRead,
          isMine: lastMessage.senderId === userId,
        },
      };
    })
  );

  // Filter nulls and sort by most recent message DESC
  const conversations = conversationEntries
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime());

  return {
    conversations,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
