// src/modules/checkin/checkin.repository.ts
import { prisma } from '../../config/database';

export const checkinRepository = {
  // Đi từ Ticket -> OrderItem -> TicketType -> Event: đây là lý do ERD
  // ở Phase 2 thiết kế các bảng liên kết chặt chẽ - để từ 1 mã QR quét
  // được, ta lần ngược ra biết chính xác vé này thuộc Event nào.
  findTicketByQrCode(qrCode: string) {
    return prisma.ticket.findUnique({
      where: { qrCode },
      include: {
        orderItem: {
          include: {
            ticketType: { include: { event: true } },
            order: { include: { user: { select: { fullName: true, email: true } } } },
          },
        },
      },
    });
  },

  // Transaction: đánh dấu vé đã check-in VÀ ghi lịch sử CÙNG LÚC - tránh
  // tình trạng chỉ update được isCheckedIn mà quên ghi Checkin (hoặc
  // ngược lại) nếu có lỗi giữa chừng.
  markCheckedIn(ticketId: string, staffId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticketId },
        data: { isCheckedIn: true },
      });
      return tx.checkin.create({
        data: { ticketId, staffId },
      });
    });
  },
};
