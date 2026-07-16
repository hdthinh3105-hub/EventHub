// src/modules/ticket-type/ticket-type.service.ts
import { ticketTypeRepository } from './ticket-type.repository';
import { eventRepository } from '../event/event.repository';
import { assertCanModifyEvent } from '../event/event.service';
import { AppError } from '../../utils/apiResponse';
import { CreateTicketTypeInput, UpdateTicketTypeInput } from './ticket-type.validation';
import { JwtPayload } from '../../utils/jwt';

async function getEventOrThrow(eventId: string) {
  const event = await eventRepository.findById(eventId);
  if (!event) {
    throw new AppError('Không tìm thấy sự kiện', 404);
  }
  return event;
}

export const ticketTypeService = {
  listByEvent(eventId: string) {
    return ticketTypeRepository.findByEventId(eventId);
  },

  async create(eventId: string, input: CreateTicketTypeInput, user: JwtPayload) {
    const event = await getEventOrThrow(eventId);
    // Quyền sở hữu TicketType = quyền sở hữu Event chứa nó -
    // tái sử dụng đúng logic đã viết ở Phase 6 phần Event, không lặp code.
    assertCanModifyEvent(event, user);

    return ticketTypeRepository.create(eventId, input);
  },

  async update(id: string, input: UpdateTicketTypeInput, user: JwtPayload) {
    const ticketType = await ticketTypeRepository.findById(id);
    if (!ticketType) {
      throw new AppError('Không tìm thấy loại vé', 404);
    }

    const event = await getEventOrThrow(ticketType.eventId);
    assertCanModifyEvent(event, user);

    // Không cho giảm totalQuantity xuống thấp hơn số vé ĐÃ BÁN THẬT
    // (soldQuantity) - tránh tạo ra tình huống vô lý "đã bán 50 vé
    // nhưng tổng số vé còn 30". soldQuantity chỉ được server tự tăng
    // qua giao dịch mua vé thật (Phase 7), không nhận từ client ở đây.
    if (input.totalQuantity !== undefined && input.totalQuantity < ticketType.soldQuantity) {
      throw new AppError(
        `Không thể đặt tổng số vé (${input.totalQuantity}) thấp hơn số vé đã bán (${ticketType.soldQuantity})`,
        400,
      );
    }

    return ticketTypeRepository.update(id, input);
  },

  async remove(id: string, user: JwtPayload) {
    const ticketType = await ticketTypeRepository.findById(id);
    if (!ticketType) {
      throw new AppError('Không tìm thấy loại vé', 404);
    }

    const event = await getEventOrThrow(ticketType.eventId);
    assertCanModifyEvent(event, user);

    // Không cho xóa loại vé đã có người mua - tránh mất dữ liệu lịch sử
    // giao dịch, ảnh hưởng tới vé đã phát hành cho khách.
    if (ticketType.soldQuantity > 0) {
      throw new AppError('Không thể xóa loại vé đã có người mua', 409);
    }

    return ticketTypeRepository.delete(id);
  },
};
