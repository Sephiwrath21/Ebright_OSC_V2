import { prisma } from './prisma';

export interface NotificationInput {
  type: string;
  title: string;
  message: string;
  parentId?: string;
  /** JSON string — see the Notification.metadata comment in schema.prisma for shape per type. */
  metadata?: string;
}

export async function createNotification(data: NotificationInput) {
  return prisma.ebrightCepNotification.create({
    data: {
      type: data.type,
      title: data.title,
      message: data.message,
      read: false,
      parentId: data.parentId ?? null,
      metadata: data.metadata ?? null,
    },
  });
}
