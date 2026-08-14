// src/jobs/expireHolds.job.ts
//
// Cách tiếp cận ĐƠN GIẢN dùng setInterval - đủ dùng cho quy mô project
// này, nhưng có giới hạn cần biết (rất đáng nói khi phỏng vấn):
// 1. Nếu server restart, timer mất, hold hết hạn có thể "trôi" vài giây
//    tới khi job chạy lại - chấp nhận được vì hold vốn đã có expiresAt
//    kiểm tra ở tầng tính "available" (Phase 7.3), không phụ thuộc
//    HOÀN TOÀN vào job này để đảm bảo đúng - job chỉ để DỌN RÁC định kỳ.
// 2. Chạy nhiều instance server cùng lúc (scale ngang) sẽ khiến NHIỀU
//    job chạy trùng nhau, lãng phí (dù không sai logic vì deleteMany
//    là idempotent - xóa cái đã xóa không lỗi). Đây chính xác là lý do
//    hệ thống thật dùng job queue tập trung (BullMQ, RabbitMQ) thay vì
//    setInterval trong từng instance - sẽ giới thiệu ở Phase 9.

import { ticketHoldRepository } from '../modules/ticket-hold/ticket-hold.repository';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { emitToEvent } from '../config/socket';

export function startExpireHoldsJob() {
  const CLEANUP_INTERVAL_MS = env.HOLD_CLEANUP_INTERVAL_MS; // mặc định 12 giờ

  setInterval(async () => {
    try {
      // Lấy danh sách hold hết hạn TRƯỚC khi xóa để biết cần thông báo
      // cho event nào / ticketType nào (số vé được hoàn trả về quỹ vé).
      const expired = await ticketHoldRepository.findExpired();
      const result = await ticketHoldRepository.deleteExpired();

      if (result.count > 0) {
        logger.info(`[expireHoldsJob] Đã dọn ${result.count} hold hết hạn`);

        // Gom số vé hoàn trả theo từng ticketType của từng event, rồi
        // emit 1 sự kiện 'hold_released' cho mỗi event - trang khách xem
        // sự kiện sẽ tăng số vé "Còn lại" lên realtime khi hold bị nhả.
        const byEvent = new Map<string, { ticketTypeId: string; quantityReleased: number }[]>();
        for (const h of expired) {
          const eventId = h.ticketType.eventId;
          const list = byEvent.get(eventId) ?? [];
          const existing = list.find((r) => r.ticketTypeId === h.ticketTypeId);
          if (existing) {
            existing.quantityReleased += h.quantity;
          } else {
            list.push({ ticketTypeId: h.ticketTypeId, quantityReleased: h.quantity });
          }
          byEvent.set(eventId, list);
        }

        for (const [eventId, releases] of byEvent) {
          try {
            emitToEvent(eventId, 'hold_released', { eventId, releases });
          } catch (err) {
            logger.error(`[Socket.IO] Lỗi emit hold_released (event:${eventId}): ${err}`);
          }
        }
      }
    } catch (err) {
      logger.error(`[expireHoldsJob] Lỗi khi dọn hold hết hạn: ${err}`);
    }
  }, CLEANUP_INTERVAL_MS);

  logger.info(`[expireHoldsJob] Job dọn hold hết hạn đã khởi động (chạy mỗi ${CLEANUP_INTERVAL_MS / 1000}s)`);
}
