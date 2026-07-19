// src/modules/ticket-hold/ticket-hold.service.ts
import { ticketHoldRepository } from './ticket-hold.repository';
import { ticketTypeRepository } from '../ticket-type/ticket-type.repository';
import { eventRepository } from '../event/event.repository';
import { AppError } from '../../utils/apiResponse';
import { CreateHoldInput } from './ticket-hold.validation';
import { JwtPayload } from '../../utils/jwt';
import { holdRejectedCounter } from '../../config/metrics';

const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 phút, khớp thiết kế Phase 2
const MAX_RETRY = 5;

export const ticketHoldService = {
  async createHold(input: CreateHoldInput, user: JwtPayload) {
    const ticketTypeForEventCheck = await ticketTypeRepository.findById(input.ticketTypeId);
    if (!ticketTypeForEventCheck) {
      throw new AppError('Không tìm thấy loại vé', 404);
    }
    const event = await eventRepository.findById(ticketTypeForEventCheck.eventId);
    if (!event) {
      throw new AppError('Không tìm thấy sự kiện', 404);
    }
    if (event.status !== 'PUBLISHED') {
      throw new AppError('Sự kiện chưa mở bán hoặc đã bị hủy/kết thúc', 409);
    }
    if (event.startTime <= new Date()) {
      throw new AppError('Sự kiện đã bắt đầu hoặc đã diễn ra, không thể đặt vé', 409);
    }

    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const ticketType = await ticketTypeRepository.findById(input.ticketTypeId);
      if (!ticketType) {
        throw new AppError('Không tìm thấy loại vé', 404);
      }

      const activeHeld = await ticketHoldRepository.sumActiveHolds(input.ticketTypeId);
      const available = ticketType.totalQuantity - ticketType.soldQuantity - activeHeld;

      if (input.quantity > available) {
        // --- Metric: đếm lần từ chối do THẬT SỰ hết vé (khác với "hết
        // lượt retry" ở dưới cuối hàm) - 2 label khác nhau giúp Grafana
        // phân biệt được "sự kiện đang hot, cháy vé thật" (out_of_stock
        // tăng đều) với "hệ thống đang bị nghẽn kỹ thuật" (contention
        // tăng vọt bất thường) - đây là 2 hướng xử lý HOÀN TOÀN khác
        // nhau nếu Organizer/DevOps phải phản ứng.
        holdRejectedCounter.inc({ reason: 'out_of_stock' });
        throw new AppError(`Chỉ còn ${available} vé, không đủ để giữ ${input.quantity} vé`, 409);
      }

      const bumpResult = await ticketHoldRepository.tryBumpVersion(ticketType.id, ticketType.version);

      if (bumpResult.count === 0) {
        continue;
      }

      const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
      const hold = await ticketHoldRepository.createHold({
        ticketTypeId: input.ticketTypeId,
        userId: user.userId,
        quantity: input.quantity,
        expiresAt,
      });

      return hold;
    }

    holdRejectedCounter.inc({ reason: 'contention' });
    throw new AppError('Hệ thống đang bận, vui lòng thử lại sau giây lát', 409);
  },
};