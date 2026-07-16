// src/queues/email.queue.ts
import { getChannel, EMAIL_QUEUE } from '../config/rabbitmq';
import { TicketEmailPayload } from '../utils/mailer';
import { logger } from '../utils/logger';

// Discriminated union: mỗi message có 1 "type" để Consumer biết cần gọi
// hàm mailer nào - cách này dễ mở rộng thêm loại email mới sau này chỉ
// bằng cách thêm 1 nhánh union, không cần đổi cấu trúc code cũ.
export type EmailJob =
  | { type: 'ticket'; payload: TicketEmailPayload }
  | { type: 'verification'; payload: { to: string; token: string } }
  | { type: 'password_reset'; payload: { to: string; token: string } };

function publish(job: EmailJob): void {
  try {
    const channel = getChannel();
    channel.sendToQueue(EMAIL_QUEUE, Buffer.from(JSON.stringify(job)), {
      persistent: true,
    });
    logger.debug(`[EmailQueue] Đã đẩy message loại "${job.type}"`);
  } catch (err) {
    logger.error(`[EmailQueue] Lỗi đẩy message: ${err}`);
  }
}

export function publishTicketEmail(payload: TicketEmailPayload): void {
  publish({ type: 'ticket', payload });
}

export function publishVerificationEmail(to: string, token: string): void {
  publish({ type: 'verification', payload: { to, token } });
}

export function publishPasswordResetEmail(to: string, token: string): void {
  publish({ type: 'password_reset', payload: { to, token } });
}