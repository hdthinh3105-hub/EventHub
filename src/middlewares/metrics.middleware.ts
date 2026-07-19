// src/middlewares/metrics.middleware.ts
//
// Đo thời gian TỪ LÚC request vào TỚI LÚC response đi ra - dùng sự kiện
// "finish" của response (Express bắn ra khi đã gửi xong toàn bộ response
// cho client), không phải đo ngay sau khi gọi next() (lúc đó response
// CHƯA CHẮC đã gửi xong, đặc biệt với response lớn hoặc streaming).
//
// Dùng req.route?.path thay vì req.path để lấy PATTERN của route (VD
// "/api/events/:id"), không phải giá trị THẬT (VD "/api/events/abc-123").
// Nếu dùng giá trị thật, mỗi Event khác nhau sẽ tạo ra 1 "label" riêng
// biệt trong Prometheus - hàng nghìn Event sẽ làm phình to metrics tới
// mức không dùng được (gọi là vấn đề "cardinality explosion" - từ khóa
// đáng nhớ khi phỏng vấn về Observability).

import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration } from '../config/metrics';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint(); // đo bằng hrtime (nanosecond) - chính xác hơn Date.now() cho khoảng thời gian ngắn

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;

    // req.route chỉ tồn tại SAU KHI Express đã khớp được route cụ thể -
    // với request khớp route thật, path là dạng pattern ("/api/events/:id").
    // Với request KHÔNG khớp route nào (404), req.route là undefined ->
    // fallback về "unmatched" để không lẫn với route thật.
    const routePath = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';

    httpRequestDuration.observe(
      { method: req.method, route: routePath, status_code: res.statusCode },
      durationSeconds,
    );
  });

  next();
}
