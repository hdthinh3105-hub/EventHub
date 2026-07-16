// src/modules/notification/notification.repository.ts
import { prisma } from '../../config/database';

export const notificationRepository = {
  create(data: { userId: string; title: string; message: string }) {
    return prisma.notification.create({ data });
  },

  findByUserId(userId: string) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50, // giới hạn 50 thông báo gần nhất - tránh trả về danh sách vô hạn
    });
  },

  findById(id: string) {
    return prisma.notification.findUnique({ where: { id } });
  },

  markRead(id: string) {
    return prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  },
};
