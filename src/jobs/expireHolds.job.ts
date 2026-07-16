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
import { logger } from '../utils/logger';

const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 phút

export function startExpireHoldsJob() {
  setInterval(async () => {
    try {
      const result = await ticketHoldRepository.deleteExpired();
      if (result.count > 0) {
        logger.info(`[expireHoldsJob] Đã dọn ${result.count} hold hết hạn`);
      }
    } catch (err) {
      logger.error(`[expireHoldsJob] Lỗi khi dọn hold hết hạn: ${err}`);
    }
  }, CLEANUP_INTERVAL_MS);

  logger.info('[expireHoldsJob] Job dọn hold hết hạn đã khởi động (chạy mỗi 60s)');
}
