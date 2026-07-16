// src/modules/ticket-hold/ticket-hold.service.ts
import { ticketHoldRepository } from './ticket-hold.repository';
import { ticketTypeRepository } from '../ticket-type/ticket-type.repository';
import { AppError } from '../../utils/apiResponse';
import { CreateHoldInput } from './ticket-hold.validation';
import { JwtPayload } from '../../utils/jwt';

const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 phút, khớp thiết kế Phase 2
const MAX_RETRY = 3;

export const ticketHoldService = {
  async createHold(input: CreateHoldInput, user: JwtPayload) {
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      // Bước 1: đọc dữ liệu MỚI NHẤT ở đầu mỗi vòng lặp - không được cache
      // lại từ vòng lặp trước, vì đó chính xác là nguồn gốc của race condition.
      const ticketType = await ticketTypeRepository.findById(input.ticketTypeId);
      if (!ticketType) {
        throw new AppError('Không tìm thấy loại vé', 404);
      }

      // Bước 2 + 3: tính available = tổng - đã bán - đang giữ chỗ tạm
      const activeHeld = await ticketHoldRepository.sumActiveHolds(input.ticketTypeId);
      const available = ticketType.totalQuantity - ticketType.soldQuantity - activeHeld;

      // Bước 4: hết vé thật sự - từ chối ngay, KHÔNG cần retry vì retry
      // cũng sẽ ra kết quả tương tự (trừ khi có người khác vừa hủy hold,
      // nhưng đó là edge case chấp nhận được - user chỉ cần thử lại request).
      if (input.quantity > available) {
        throw new AppError(`Chỉ còn ${available} vé, không đủ để giữ ${input.quantity} vé`, 409);
      }

      // Bước 5: thử "đặt cọc" quyền ghi bằng CAS trên cột version
      const bumpResult = await ticketHoldRepository.tryBumpVersion(ticketType.id, ticketType.version);

      if (bumpResult.count === 0) {
        // Ai đó đã ghi (tạo hold khác) xen giữa lúc ta đọc (bước 1) và ghi
        // (bước 5) - version đã đổi, CAS thất bại. Không throw lỗi ngay,
        // quay lại đầu vòng lặp để đọc dữ liệu mới nhất và thử lại.
        continue;
      }

      // CAS thành công - không ai chen ngang, an toàn để tạo hold
      const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
      const hold = await ticketHoldRepository.createHold({
        ticketTypeId: input.ticketTypeId,
        userId: user.userId,
        quantity: input.quantity,
        expiresAt,
      });

      return hold;
    }

    // Hết số lần retry cho phép - tranh chấp quá cao (nhiều request cùng
    // lúc liên tục ghi đè lẫn nhau). Trả lỗi để client tự thử lại,
    // KHÔNG retry vô hạn (tránh treo request, DoS chính server của mình).
    throw new AppError('Hệ thống đang bận, vui lòng thử lại sau giây lát', 409);
  },
};