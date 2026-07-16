// src/utils/cache.ts
//
// Đây là hiện thực CỤ THỂ của Cache-Aside Pattern đã giải thích ở Phase 8.1:
// 1. Thử đọc từ Redis trước (cache hit -> trả ngay)
// 2. Không có -> chạy hàm fetcher (thường là query DB), lưu kết quả vào
//    Redis kèm TTL, rồi trả về (cache miss)
//
// Thiết kế generic <T> để dùng được cho MỌI loại dữ liệu (Event, Category,
// Venue...) mà không phải viết lại logic get-set-parse cho từng module.

import { redis } from '../config/redis';
import { logger } from './logger';

export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) {
      logger.debug(`[Cache] HIT: ${key}`);
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    // Redis lỗi KHÔNG được làm sập API - chỉ log lại và coi như cache miss,
    // fallback về query DB trực tiếp. Cache là tối ưu hiệu năng, không
    // phải điểm phụ thuộc bắt buộc (Redis down thì app vẫn phải chạy được,
    // chỉ chậm hơn).
    logger.error(`[Cache] Lỗi đọc cache key ${key}: ${err}`);
  }

  logger.debug(`[Cache] MISS: ${key}`);
  const fresh = await fetcher();

  try {
    await redis.set(key, JSON.stringify(fresh), 'EX', ttlSeconds);
  } catch (err) {
    logger.error(`[Cache] Lỗi ghi cache key ${key}: ${err}`);
  }

  return fresh;
}

// Xóa cache theo pattern (VD: "events:*") - dùng khi có thao tác ghi
// (create/update/delete) làm cache cũ không còn đúng nữa.
// Dùng SCAN thay vì KEYS - KEYS block toàn bộ Redis server trong lúc quét
// (nguy hiểm ở production với nhiều key), SCAN quét theo từng phần nhỏ,
// không chặn các lệnh khác đang chạy song song.
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const stream = redis.scanStream({ match: pattern, count: 100 });
    const keysToDelete: string[] = [];

    for await (const keys of stream) {
      keysToDelete.push(...keys);
    }

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
      logger.debug(`[Cache] Đã xóa ${keysToDelete.length} key khớp pattern: ${pattern}`);
    }
  } catch (err) {
    logger.error(`[Cache] Lỗi xóa cache pattern ${pattern}: ${err}`);
  }
}
