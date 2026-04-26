import { prisma } from '../../src/lib/prisma';
import {
  getRecipientPublicKey,
  sendMessage,
  getConversation,
  getConversationList,
} from '../../src/services/message.service';
import { createTestUser } from '../helpers/db';
import { NotFoundError, ValidationError } from '../../src/utils/errors';

describe('message.service integration', () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.message.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  // ─── getRecipientPublicKey ────────────────────────────────────────────────────

  describe('getRecipientPublicKey', () => {
    it('returns userId, username and publicKey of the recipient', async () => {
      const requester = await createTestUser();
      const recipient = await createTestUser();

      const result = await getRecipientPublicKey(requester.id, recipient.id);

      expect(result.userId).toBe(recipient.id);
      expect(result.username).toBe(recipient.username);
      expect(result.publicKey).toBe(recipient.publicKey);
    });

    it('throws NotFoundError when recipient does not exist', async () => {
      const requester = await createTestUser();
      await expect(
        getRecipientPublicKey(requester.id, '00000000-0000-4000-8000-000000000099')
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError when recipient is banned', async () => {
      const requester = await createTestUser();
      const banned = await createTestUser({ isBanned: true });
      await expect(
        getRecipientPublicKey(requester.id, banned.id)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('does NOT expose passwordHash in the response', async () => {
      const requester = await createTestUser();
      const recipient = await createTestUser();
      const result = await getRecipientPublicKey(requester.id, recipient.id);
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  // ─── sendMessage ──────────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('creates a message and returns messageId and createdAt', async () => {
      const sender = await createTestUser();
      const recipient = await createTestUser();

      const result = await sendMessage(sender.id, {
        recipientId: recipient.id,
        encryptedContent: 'encrypted-blob',
      });

      expect(result.messageId).toBeTruthy();
      expect(result.createdAt).toBeInstanceOf(Date);

      // Verify stored in DB
      const stored = await prisma.message.findUnique({ where: { id: result.messageId } });
      expect(stored).not.toBeNull();
      expect(stored!.encryptedContent).toBe('encrypted-blob');
    });

    it('does NOT return encryptedContent in the response', async () => {
      const sender = await createTestUser();
      const recipient = await createTestUser();

      const result = await sendMessage(sender.id, {
        recipientId: recipient.id,
        encryptedContent: 'secret-cipher',
      });

      expect((result as Record<string, unknown>).encryptedContent).toBeUndefined();
    });

    it('throws ValidationError when sender === recipient', async () => {
      const user = await createTestUser();
      await expect(
        sendMessage(user.id, { recipientId: user.id, encryptedContent: 'cipher' })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError when recipient does not exist', async () => {
      const sender = await createTestUser();
      await expect(
        sendMessage(sender.id, {
          recipientId: '00000000-0000-4000-8000-000000000099',
          encryptedContent: 'cipher',
        })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError when recipient is banned', async () => {
      const sender = await createTestUser();
      const banned = await createTestUser({ isBanned: true });
      await expect(
        sendMessage(sender.id, { recipientId: banned.id, encryptedContent: 'cipher' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ─── getConversation ──────────────────────────────────────────────────────────

  describe('getConversation', () => {
    it('returns messages in chronological order (asc) with pagination', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();

      await sendMessage(u1.id, { recipientId: u2.id, encryptedContent: 'cipher-1' });
      await sendMessage(u2.id, { recipientId: u1.id, encryptedContent: 'cipher-2' });
      await sendMessage(u1.id, { recipientId: u2.id, encryptedContent: 'cipher-3' });

      const result = await getConversation(u1.id, u2.id, 1, 10);
      expect(result.messages.length).toBe(3);
      expect(result.pagination.total).toBe(3);

      // Verify ascending order
      const times = result.messages.map((m) => new Date(m.createdAt).getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
    });

    it('marks incoming messages as read (fire-and-forget verification)', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();

      // u2 sends to u1
      await sendMessage(u2.id, { recipientId: u1.id, encryptedContent: 'cipher' });

      // Before getConversation, message should be unread
      const before = await prisma.message.findFirst({ where: { recipientId: u1.id } });
      expect(before!.isRead).toBe(false);

      // u1 reads the conversation — the service marks messages read synchronously via .catch handler
      await getConversation(u1.id, u2.id, 1, 10);

      let after = await prisma.message.findFirst({ where: { recipientId: u1.id } });
      const startTime = Date.now();
      while (!after!.isRead && Date.now() - startTime < 2000) {
        await new Promise((r) => setTimeout(r, 50));
        after = await prisma.message.findFirst({ where: { recipientId: u1.id } });
      }
      expect(after!.isRead).toBe(true);
    });

    it('throws NotFoundError when peer is banned', async () => {
      const u1 = await createTestUser();
      const banned = await createTestUser({ isBanned: true });
      await expect(
        getConversation(u1.id, banned.id, 1, 10)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns empty messages when no conversation exists', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      const result = await getConversation(u1.id, u2.id, 1, 10);
      expect(result.messages).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it('throws NotFoundError when the other user does not exist', async () => {
      const u1 = await createTestUser();
      await expect(
        getConversation(u1.id, '00000000-0000-4000-8000-000000000099', 1, 10)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('respects pagination limit', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();

      for (let i = 0; i < 5; i++) {
        await sendMessage(u1.id, { recipientId: u2.id, encryptedContent: `cipher-${i}` });
      }

      const result = await getConversation(u1.id, u2.id, 1, 3);
      expect(result.messages.length).toBe(3);
      expect(result.pagination.totalPages).toBe(2);
    });
  });

  // ─── getConversationList ──────────────────────────────────────────────────────

  describe('getConversationList', () => {
    it('returns a list of conversations sorted by most recent first', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      const u3 = await createTestUser();

      await sendMessage(u1.id, { recipientId: u2.id, encryptedContent: 'to-u2' });
      await sendMessage(u1.id, { recipientId: u3.id, encryptedContent: 'to-u3' });

      // Force deterministic ordering by setting explicit timestamps
      const msgToU2 = await prisma.message.findFirst({ where: { recipientId: u2.id } });
      const msgToU3 = await prisma.message.findFirst({ where: { recipientId: u3.id } });
      await prisma.message.update({
        where: { id: msgToU2!.id },
        data: { createdAt: new Date('2024-01-01T00:00:00Z') },
      });
      await prisma.message.update({
        where: { id: msgToU3!.id },
        data: { createdAt: new Date('2024-01-02T00:00:00Z') },
      });

      const result = await getConversationList(u1.id);

      expect(result.conversations.length).toBe(2);
      // Most recent (u3, 2024-01-02) should appear first
      expect(result.conversations[0].user.id).toBe(u3.id);
      expect(result.conversations[1].user.id).toBe(u2.id);
    });

    it('includes lastMessage metadata correctly', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();

      await sendMessage(u1.id, { recipientId: u2.id, encryptedContent: 'my-cipher' });

      const result = await getConversationList(u1.id);
      expect(result.conversations.length).toBe(1);

      const last = result.conversations[0].lastMessage;
      expect(last.encryptedContent).toBe('my-cipher');
      expect(last.isMine).toBe(true);
      expect(last.createdAt).toBeInstanceOf(Date);
    });

    it('shows isMine=false when the last message was from the other user', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();

      await sendMessage(u1.id, { recipientId: u2.id, encryptedContent: 'first' });
      await new Promise((r) => setTimeout(r, 10));
      await sendMessage(u2.id, { recipientId: u1.id, encryptedContent: 'last' });

      const result = await getConversationList(u1.id);
      expect(result.conversations[0].lastMessage.isMine).toBe(false);
    });

    it('deduplicates peers from both sent and received messages', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();

      // Both directions with the same peer
      await sendMessage(u1.id, { recipientId: u2.id, encryptedContent: 'a' });
      await sendMessage(u2.id, { recipientId: u1.id, encryptedContent: 'b' });

      const result = await getConversationList(u1.id);
      expect(result.conversations.length).toBe(1);
    });

    it('returns empty list when user has no messages', async () => {
      const u1 = await createTestUser();
      const result = await getConversationList(u1.id);
      expect(result.conversations).toEqual([]);
    });
  });
});
