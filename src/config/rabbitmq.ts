// src/config/rabbitmq.ts
//
// Khác với Prisma/Redis (dùng pattern global singleton đơn giản vì là
// thư viện đồng bộ lúc khởi tạo), RabbitMQ cần connect() BẤT ĐỒNG BỘ
// trước khi dùng được channel - nên ta expose 1 hàm connectRabbitMQ()
// gọi 1 LẦN DUY NHẤT lúc server khởi động (xem server.ts), rồi
// getChannel() dùng lại channel đó ở mọi nơi khác.

import amqp, { Channel, ChannelModel } from 'amqplib';
import { env } from './env';
import { logger } from '../utils/logger';

export const EMAIL_QUEUE = 'email_notifications';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export async function connectRabbitMQ(): Promise<void> {
  connection = await amqp.connect(env.RABBITMQ_URL);
  channel = await connection.createChannel();

  // durable: true - queue được LƯU XUỐNG ĐĨA (không chỉ tồn tại trong
  // RAM), nghĩa là nếu RabbitMQ server restart, message đang chờ xử lý
  // KHÔNG bị mất. Đánh đổi: ghi/đọc chậm hơn 1 chút so với queue không
  // durable, nhưng với việc gửi email vé (không được phép mất), đây là
  // đánh đổi bắt buộc phải chấp nhận.
  await channel.assertQueue(EMAIL_QUEUE, { durable: true });

  connection.on('error', (err) => {
    logger.error(`[RabbitMQ] Lỗi connection: ${err.message}`);
  });

  logger.info('[RabbitMQ] Kết nối thành công');
}

export function getChannel(): Channel {
  if (!channel) {
    throw new Error('RabbitMQ channel chưa được khởi tạo - gọi connectRabbitMQ() trước');
  }
  return channel;
}

export async function closeRabbitMQ(): Promise<void> {
  await channel?.close();
  await connection?.close();
}
