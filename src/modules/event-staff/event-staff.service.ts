// src/modules/event-staff/event-staff.service.ts
import { eventStaffRepository } from './event-staff.repository';
import { eventRepository } from '../event/event.repository';
import { userRepository } from '../user/user.repository';
import { assertCanModifyEvent } from '../event/event.service';
import { AppError } from '../../utils/apiResponse';
import { JwtPayload } from '../../utils/jwt';

async function getEventOrThrow(eventId: string) {
  const event = await eventRepository.findById(eventId);
  if (!event) {
    throw new AppError('Không tìm thấy sự kiện', 404);
  }
  return event;
}

export const eventStaffService = {
  async list(eventId: string, actor: JwtPayload) {
    const event = await getEventOrThrow(eventId);
    assertCanModifyEvent(event, actor); // chỉ chủ Event/Admin xem được danh sách Staff
    return eventStaffRepository.findByEventId(eventId);
  },

  async assign(eventId: string, userId: string, actor: JwtPayload) {
    const event = await getEventOrThrow(eventId);
    assertCanModifyEvent(event, actor);

    const targetUser = await userRepository.findById(userId);
    if (!targetUser) {
      throw new AppError('Không tìm thấy user', 404);
    }
    // Chỉ user có role STAFF mới được gán vào Event để check-in - tránh
    // Organizer vô tình gán nhầm 1 Customer/Organizer khác vào vai trò này.
    if (targetUser.role.name !== 'STAFF') {
      throw new AppError('User này không có role STAFF', 400);
    }

    const existing = await eventStaffRepository.findAssignment(eventId, userId);
    if (existing) {
      throw new AppError('Staff này đã được gán vào sự kiện', 409);
    }

    return eventStaffRepository.assign(eventId, userId);
  },

  async remove(eventId: string, userId: string, actor: JwtPayload) {
    const event = await getEventOrThrow(eventId);
    assertCanModifyEvent(event, actor);

    const existing = await eventStaffRepository.findAssignment(eventId, userId);
    if (!existing) {
      throw new AppError('Staff chưa được gán vào sự kiện này', 404);
    }

    return eventStaffRepository.remove(eventId, userId);
  },
};
