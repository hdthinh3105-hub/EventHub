// src/modules/checkin/checkin.service.ts
import { checkinRepository } from './checkin.repository';
import { eventStaffRepository } from '../event-staff/event-staff.repository';
import { AppError } from '../../utils/apiResponse';
import { JwtPayload } from '../../utils/jwt';
import { emitToEvent } from '../../config/socket';
import { logger } from '../../utils/logger';

export const checkinService = {
  async checkin(qrCode: string, actor: JwtPayload) {
    const ticket = await checkinRepository.findTicketByQrCode(qrCode);
    if (!ticket) {
      throw new AppError('Mã QR không hợp lệ hoặc vé không tồn tại', 404);
    }

    const event = ticket.orderItem.ticketType.event;

    // 3 trường hợp được phép check-in - đây là "Resource-based
    // Authorization" áp dụng cho role STAFF, khác hẳn Organizer/Admin:
    // Admin bypass toàn bộ, Organizer chỉ check-in được Event của mình,
    // Staff CHỈ được check-in Event mà chính họ ĐƯỢC GÁN (qua EventStaff),
    // không phải cứ có role STAFF là quét được MỌI sự kiện.
    const isAdmin = actor.roleName === 'ADMIN';
    const isOwnerOrganizer = actor.roleName === 'ORGANIZER' && event.organizerId === actor.userId;
    const isAssignedStaff =
      actor.roleName === 'STAFF' &&
      (await eventStaffRepository.isStaffAssignedToEvent(event.id, actor.userId));

    if (!isAdmin && !isOwnerOrganizer && !isAssignedStaff) {
      throw new AppError('Bạn không có quyền check-in vé cho sự kiện này', 403);
    }

    // Chống check-in trùng - vé chỉ được quét thành công ĐÚNG 1 LẦN,
    // tránh 1 vé bị dùng lại nhiều lần để vào cổng (gian lận vé).
    if (ticket.isCheckedIn) {
      throw new AppError('Vé này đã được check-in trước đó', 409);
    }

    await checkinRepository.markCheckedIn(ticket.id, actor.userId);

    try {
      // Đẩy check-in REALTIME tới room event:<id> - nơi Organizer/nhân
      // viên khác đang mở trang quản lý sẽ nhận được luồng check-in trực
      // tiếp (hiển thị "khách vừa vào cổng") dù họ không phải người quét.
      emitToEvent(event.id, 'checkin_processed', {
        ticketId: ticket.id,
        eventId: event.id,
        customerName: ticket.orderItem.order.user.fullName,
        customerEmail: ticket.orderItem.order.user.email,
        checkedInAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(`[Socket.IO] Lỗi emit checkin_processed: ${err}`);
    }

    return {
      ticketId: ticket.id,
      eventTitle: event.title,
      customerName: ticket.orderItem.order.user.fullName,
      checkedInAt: new Date(),
    };
  },
};
