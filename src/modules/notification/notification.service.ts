// src/modules/notification/notification.service.ts
import { notificationRepository } from './notification.repository';
import { AppError } from '../../utils/apiResponse';
import { JwtPayload } from '../../utils/jwt';

export const notificationService = {
  list(user: JwtPayload) {
    return notificationRepository.findByUserId(user.userId);
  },

  async markRead(id: string, user: JwtPayload) {
    const notification = await notificationRepository.findById(id);
    if (!notification) {
      throw new AppError('Không tìm thấy thông báo', 404);
    }
    // Chỉ chính chủ thông báo mới được đánh dấu đã đọc - tránh user A
    // đánh dấu đọc thông báo của user B nếu lỡ đoán được id.
    if (notification.userId !== user.userId) {
      throw new AppError('Bạn không có quyền với thông báo này', 403);
    }
    return notificationRepository.markRead(id);
  },
};
