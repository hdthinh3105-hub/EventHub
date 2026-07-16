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
};
