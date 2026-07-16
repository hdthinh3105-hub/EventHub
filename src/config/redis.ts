// src/config/redis.ts
//
// Cùng lý do với Prisma singleton (database.ts) - tránh "tsx watch"
// tạo thêm connection mới mỗi lần code reload lúc dev.

import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line no-var
  var redisGlobal: Redis | undefined;
}

export const redis =
  globalThis.redisGlobal ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3, // tránh treo request nếu Redis tạm thời không phản hồi
  });

redis.on('error', (err) => {
  logger.error(`[Redis] Lỗi kết nối: ${err.message}`);
});

redis.on('connect', () => {
  logger.info('[Redis] Kết nối thành công');
});

if (env.NODE_ENV !== 'production') {
  globalThis.redisGlobal = redis;
}
