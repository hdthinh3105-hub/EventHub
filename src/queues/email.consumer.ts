// src/queues/email.consumer.ts
import { getChannel, EMAIL_QUEUE } from '../config/rabbitmq';
import { sendTicketEmail, sendVerificationEmail, sendPasswordResetEmail } from '../utils/mailer';
import { EmailJob } from './email.queue';
import { logger } from '../utils/logger';

export function startEmailConsumer(): void {
  const channel = getChannel();

  channel.prefetch(1);

  channel.consume(EMAIL_QUEUE, async (msg) => {
    if (!msg) return;

    try {
      const job = JSON.parse(msg.content.toString()) as EmailJob;

      // switch theo "type" - TypeScript tự narrow đúng kiểu payload cho
      // từng nhánh nhờ discriminated union, không cần ép kiểu (as) thủ công.
      switch (job.type) {
        case 'ticket':
          await sendTicketEmail(job.payload);
          break;
        case 'verification':
          await sendVerificationEmail(job.payload.to, job.payload.token);
          break;
        case 'password_reset':
          await sendPasswordResetEmail(job.payload.to, job.payload.token);
          break;
      }

      channel.ack(msg);
    } catch (err) {
      logger.error(`[EmailConsumer] Lỗi xử lý message: ${err}`);
      channel.nack(msg, false, false);
    }
  });

  logger.info('[EmailConsumer] Đã bắt đầu lắng nghe queue gửi email');
}