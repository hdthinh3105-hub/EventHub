// src/app.ts
//
// File này CHỈ định nghĩa Express app - không gọi app.listen().
// Lý do tách khỏi server.ts: để có thể import app trong Jest + supertest
// mà không cần mở port thật (xem Phase 14 - Testing).

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorMiddleware, notFoundMiddleware } from './middlewares/error.middleware';
import { globalRateLimiter } from './middlewares/rateLimit.middleware';
import { logger } from './utils/logger';
import { env } from './config/env';
import authRoutes from './modules/auth/auth.route';
import userRoutes from './modules/user/user.route';
import categoryRoutes from './modules/category/category.route';
import venueRoutes from './modules/venue/venue.route';
import eventRoutes from './modules/event/event.route';
import ticketTypeRoutes from './modules/ticket-type/ticket-type.route';
import ticketHoldRoutes from './modules/ticket-hold/ticket-hold.route';
import orderRoutes from './modules/order/order.route';
import eventStaffRoutes from './modules/event-staff/event-staff.route';
import checkinRoutes from './modules/checkin/checkin.route';
import notificationRoutes from './modules/notification/notification.route';

const app: Application = express();

// --- Security middleware (bật ngay từ đầu, không đợi tới Phase Security) ---
app.use(helmet()); // set các HTTP header an toàn (chống XSS, clickjacking cơ bản...)

// CORS: đọc danh sách domain cho phép từ ALLOWED_ORIGINS (phân cách dấu
// phẩy). Nếu KHÔNG set (rỗng) - mở toàn bộ '*', chỉ chấp nhận được ở môi
// trường DEV. Production PHẢI set đúng domain FE thật, không dùng '*' -
// vì '*' kết hợp với "credentials: true" thực ra bị trình duyệt CHẶN
// (không hợp lệ theo spec CORS), nên khi có domain thật, ta trả đúng
// domain đó thay vì '*' để cookie/credentials hoạt động đúng.
const allowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
    credentials: true,
  }),
);

// --- CSRF: KHÔNG cần middleware CSRF riêng (VD csurf) ---
// CSRF tấn công dựa trên việc trình duyệt TỰ ĐỘNG gửi kèm cookie trong
// mọi request tới 1 domain, kể cả request khởi tạo từ trang web khác.
// EventHub xác thực bằng Bearer Token trong header "Authorization" (JWT,
// Phase 4) - KHÔNG lưu trong cookie - nên trình duyệt sẽ không tự động
// gửi kèm token này khi 1 trang web độc hại nào đó âm thầm gọi API,
// loại bỏ hoàn toàn véc-tơ tấn công CSRF cổ điển. Đây là lý do nhiều
// REST API hiện đại dùng Bearer Token không cần thêm CSRF token riêng.

// --- Rate Limiting - áp dụng cho toàn bộ /api (chống DoS thô sơ) ---
app.use('/api', globalRateLimiter);

// --- Body parser ---
app.use(express.json({ limit: '10mb' })); // limit tránh request quá lớn làm nghẽn server
app.use(express.urlencoded({ extended: true }));

// --- Request logging đơn giản (giúp bạn thấy request nào đang vào server lúc dev) ---
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// --- Health check endpoint - bắt buộc phải có khi deploy Docker/VPS ---
// Dùng để: Nginx/load balancer kiểm tra service còn sống không,
// Docker healthcheck, và Prometheus monitoring ở Phase 17.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Routes ---
app.get('/api', (_req, res) => {
  res.json({ message: 'EventHub API đang chạy' });
});
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/ticket-types', ticketTypeRoutes);
app.use('/api/ticket-holds', ticketHoldRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/event-staff', eventStaffRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/notifications', notificationRoutes);

// --- 404 handler - đặt SAU mọi route ---
app.use(notFoundMiddleware);

// --- Error handler - LUÔN đặt CUỐI CÙNG, sau mọi middleware/route khác ---
app.use(errorMiddleware);

export default app;