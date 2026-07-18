// src/modules/event-staff/event-staff.repository.ts
import { prisma } from '../../config/database';

export const eventStaffRepository = {
  findByEventId(eventId: string) {
    return prisma.eventStaff.findMany({
      where: { eventId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  },

  findAssignment(eventId: string, userId: string) {
    return prisma.eventStaff.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
  },

  assign(eventId: string, userId: string) {
    return prisma.eventStaff.create({ data: { eventId, userId } });
  },

  remove(eventId: string, userId: string) {
    return prisma.eventStaff.delete({
      where: { eventId_userId: { eventId, userId } },
    });
  },

  // Dùng khi Check-in: kiểm tra 1 Staff có được gán vào Event chứa vé
  // đang quét hay không.
  isStaffAssignedToEvent(eventId: string, userId: string) {
    return prisma.eventStaff.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
  },

  // Dùng khi Admin đổi role 1 user (xem user.service.ts::assignRole) -
  // đếm TỔNG số Event mà user này đang được gán làm Staff (không quan
  // tâm event nào cụ thể). Nếu > 0, KHÔNG được phép đổi role người này
  // đi nơi khác - tránh để lại bản ghi EventStaff "mồ côi" (trỏ tới 1
  // user không còn là STAFF nữa, nhưng Check-in Service vẫn tin tưởng
  // sai lệch rằng họ có quyền quét vé cho Event đó).
  countByUserId(userId: string) {
    return prisma.eventStaff.count({ where: { userId } });
  },
};