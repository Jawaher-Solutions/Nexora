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
  const skip = (page - 1) * limit;

  // Use raw SQL to get ranked peer IDs and the total distinct peer count
  const peerQuery: any[] = await prisma.$queryRaw`
    SELECT peer_id, MAX("createdAt") as "lastCreatedAt"
    FROM (
      SELECT "recipientId" as peer_id, "createdAt" FROM "Message" WHERE "senderId" = ${userId}
      UNION ALL
      SELECT "senderId" as peer_id, "createdAt" FROM "Message" WHERE "recipientId" = ${userId}
    ) AS peers
    GROUP BY peer_id
    ORDER BY "lastCreatedAt" DESC
    LIMIT ${limit} OFFSET ${skip}
  `;

  const totalQuery: any[] = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT peer_id) as count
    FROM (
      SELECT "recipientId" as peer_id FROM "Message" WHERE "senderId" = ${userId}
      UNION ALL
      SELECT "senderId" as peer_id FROM "Message" WHERE "recipientId" = ${userId}
    ) AS peers
  `;

  const total = Number(totalQuery[0]?.count || 0);
  const pagedPeerIds = peerQuery.map((row) => row.peer_id);

  if (pagedPeerIds.length === 0) {
    return {
      conversations: [],
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Batch query to resolve N+1
  const users = await prisma.user.findMany({
    where: { id: { in: pagedPeerIds } },
    select: { id: true, username: true, avatarUrl: true },
  });

  const lastMessages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId, recipientId: { in: pagedPeerIds } },
        { senderId: { in: pagedPeerIds }, recipientId: userId },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  // Extract the latest message for each peer (array is already ordered by createdAt DESC)
  const conversations = pagedPeerIds.map((peerId) => {
    const user = users.find((u) => u.id === peerId);
    const lastMessage = lastMessages.find(
      (m) =>
        (m.senderId === userId && m.recipientId === peerId) ||
        (m.senderId === peerId && m.recipientId === userId)
    );

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
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

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
