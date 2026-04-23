// notification.service.ts — the only file that creates notifications
import { prisma } from '../lib/prisma';

export async function createNotification(
  userId: string, 
  type: string, 
  message: string, 
  referenceId?: string
) {
  return prisma.notification.create({
    data: { userId, type, message, referenceId, isRead: false }
  });
}
