// src/config/env.ts
//
// Tại sao dùng Zod để validate env thay vì đọc thẳng process.env?
// Vì thiếu 1 biến môi trường (VD: quên set JWT_SECRET trên VPS lúc deploy)
// mà không validate ngay từ đầu, app vẫn "chạy được" nhưng sẽ crash một
// cách khó hiểu ở giữa lúc xử lý request nào đó gọi đến biến undefined.
// Validate ngay lúc khởi động (fail fast) giúp bạn thấy lỗi ngay lập tức,
// rõ ràng, thay vì để bug âm thầm chờ đến khi có request mới lộ ra.

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET phải >= 32 ký tự'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET phải >= 32 ký tự'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  RABBITMQ_URL: z.string().min(1, 'RABBITMQ_URL is required'),
  GMAIL_USER: z.string().email('GMAIL_USER phải là email hợp lệ'),
  GMAIL_APP_PASSWORD: z.string().min(1, 'GMAIL_APP_PASSWORD is required'),
  // Gửi mail qua Gmail REST API (HTTPS port 443 — không bị Render free
  // tier chặn như SMTP 465/587). Đủ 3 biến này thì mailer dùng REST;
  // thiếu thì fallback về SMTP cũ.
  GMAIL_CLIENT_ID: z.string().optional().default(''),
  GMAIL_CLIENT_SECRET: z.string().optional().default(''),
  GMAIL_REFRESH_TOKEN: z.string().optional().default(''),

  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY is required'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),

  // URL của Frontend - dùng để tạo link trong email (verify, reset password).
  // Có default vì Frontend project này CHƯA XÂY DỰNG - đây là placeholder
  // hợp lý để code luôn đúng chuẩn UX thật, dễ thay bằng domain thật khi
  // có Frontend triển khai xong, không cần sửa lại logic gửi email.
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Giới hạn request của rate limiter toàn API (theo IP), đếm trong window
  // 15 phút. Có thể tăng lên khi có FE realtime (Socket.IO + tải lại danh
  // sách), nhưng đừng đặt quá cao để tránh lạm dụng.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),

  // Task dọn hold hết hạn cứ mỗi N mili-giây Query DB 1 lần. 24/7 mà chạy
  // thường xuyên thì giữ Neon compute không ngủ, đốt CU-hrs nhanh.
  // Mặc định 12 giờ (43200000ms) - job chỉ là dọn rác; logic "available"
  // vẫn check expiresAt lúc đọc nên hold hết hạn là "chết" ngay lập tức,
  // row cũ chỉ được dọn trễ đi vài giờ, hoàn toàn không ảnh hưởng nghiệp vụ.
  HOLD_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(43200000),

  // Danh sách domain được phép gọi API (CORS) - phân cách bởi dấu phẩy.
  // Default rỗng = cho phép tất cả (chỉ dùng khi dev), production BẮT
  // BUỘC set đúng domain FE thật, không để mặc định.
  ALLOWED_ORIGINS: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Biến môi trường không hợp lệ:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;