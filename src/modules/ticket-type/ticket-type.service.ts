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

// Fix lỗ hổng phát hiện được: trước đây Organizer vẫn thêm/sửa/xóa
// được loại vé cho 1 Event ĐÃ HỦY hoặc ĐÃ KẾT THÚC - về nghiệp vụ
// không có ý nghĩa gì (sự kiện đã hủy thì thêm vé mới để làm gì, sự
// kiện đã xong thì sửa giá vé cũ để làm gì) và dễ gây hiểu lầm dữ liệu
// khi xem lại lịch sử. Dùng chung 1 hàm kiểm tra cho cả create/update/
// remove, tránh lặp code 3 lần.
function assertEventIsModifiable(event: { status: string }) {
  if (event.status === 'CANCELLED' || event.status === 'COMPLETED') {
    throw new AppError(
      'Không thể thêm/sửa/xóa loại vé cho sự kiện đã hủy hoặc đã kết thúc',
      409,
    );
  }
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
    assertEventIsModifiable(event);

    return ticketTypeRepository.create(eventId, input);
  },

  async update(id: string, input: UpdateTicketTypeInput, user: JwtPayload) {
    const ticketType = await ticketTypeRepository.findById(id);
    if (!ticketType) {
      throw new AppError('Không tìm thấy loại vé', 404);
    }

    const event = await getEventOrThrow(ticketType.eventId);
    assertCanModifyEvent(event, user);
    assertEventIsModifiable(event);

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
    assertEventIsModifiable(event);

    // Không cho xóa loại vé đã có người mua - tránh mất dữ liệu lịch sử
    // giao dịch, ảnh hưởng tới vé đã phát hành cho khách.
    if (ticketType.soldQuantity > 0) {
      throw new AppError('Không thể xóa loại vé đã có người mua', 409);
    }

    return ticketTypeRepository.delete(id);
  },
};