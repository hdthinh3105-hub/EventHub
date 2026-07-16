// src/modules/ticket-hold/ticket-hold.repository.ts
import { prisma } from '../../config/database';

export const ticketHoldRepository = {
  // Tính tổng số vé đang được giữ chỗ tạm (CHƯA hết hạn) cho 1 TicketType.
  // Đây là số cần trừ thêm khi tính "available", ngoài soldQuantity.
  async sumActiveHolds(ticketTypeId: string): Promise<number> {
    const result = await prisma.ticketHold.aggregate({
      where: {
        ticketTypeId,
        expiresAt: { gt: new Date() }, // chỉ tính hold còn hiệu lực
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  },

  // Đây chính là bước CAS (Compare-And-Swap) của Optimistic Locking:
  // chỉ tăng version nếu version trong DB đúng bằng version đã đọc trước đó.
  // updateMany (không phải update) vì ta cần biết CHÍNH XÁC có bao nhiêu
  // dòng bị ảnh hưởng (update thường sẽ throw lỗi nếu where không khớp,
  // updateMany trả về count=0 một cách "êm ái" để ta tự xử lý retry).
  async tryBumpVersion(ticketTypeId: string, expectedVersion: number) {
    return prisma.ticketType.updateMany({
      where: { id: ticketTypeId, version: expectedVersion },
      data: { version: { increment: 1 } },
    });
  },

  createHold(data: { ticketTypeId: string; userId: string; quantity: number; expiresAt: Date }) {
    return prisma.ticketHold.create({ data });
  },

  findById(id: string) {
    return prisma.ticketHold.findUnique({
      where: { id },
      include: { ticketType: true },
    });
  },

  delete(id: string) {
    return prisma.ticketHold.delete({ where: { id } });
  },

  // Dùng bởi job dọn dẹp (sẽ viết ở phần sau) - xóa hàng loạt hold hết hạn
  deleteExpired() {
    return prisma.ticketHold.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
  },
};
