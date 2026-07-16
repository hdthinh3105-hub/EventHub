// src/middlewares/rateLimit.middleware.ts
//
// Rate limiting THEO IP - giới hạn số request trong 1 khoảng thời gian.
// Áp dụng 2 mức: giới hạn CHUNG cho toàn API (chống DoS thô sơ), và
// giới hạn RIÊNG nghiêm ngặt hơn cho các route nhạy cảm (login/register)
// - đây là nơi bị brute-force nhiều nhất (dò mật khẩu, spam tạo tài khoản).

import rateLimit from 'express-rate-limit';

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 300, // tối đa 300 request/IP trong 15 phút cho toàn bộ API
  standardHeaders: true, // trả về header RateLimit-* chuẩn (RFC) để client biết còn bao nhiêu lượt
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều request, vui lòng thử lại sau' },
});

// Nghiêm ngặt hơn NHIỀU cho login/register - đây là mục tiêu brute-force
// phổ biến nhất (kẻ tấn công thử hàng nghìn mật khẩu/email khác nhau).
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // chỉ 10 lần thử trong 15 phút
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều lần thử, vui lòng thử lại sau 15 phút' },
});
