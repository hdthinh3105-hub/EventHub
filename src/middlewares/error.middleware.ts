// src/middlewares/error.middleware.ts
//
// Đây là middleware CUỐI CÙNG trong chain, có 4 tham số (err, req, res,
// next) - đây là cách Express NHẬN DIỆN đây là error-handling middleware
// khác với middleware thường (3 tham số). Mọi lỗi từ asyncHandler,
// hoặc next(err) gọi thủ công, đều chảy về đây.
//
// Nguyên tắc quan trọng: PHÂN BIỆT lỗi "operational" (nghiệp vụ, có thể
// đoán trước - VD: "Email đã tồn tại", "Không tìm thấy Event") với lỗi
// "programmer error" (bug thật, không đoán trước - VD: gọi property của
// undefined). Lỗi operational trả message rõ ràng cho client. Lỗi lập
// trình KHÔNG được lộ message/stack thật ra ngoài (rủi ro bảo mật - có
// thể lộ đường dẫn file, cấu trúc DB) - chỉ log lại để dev xem, còn
// client chỉ nhận "Internal Server Error" chung chung.

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/apiResponse';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  // 1. Lỗi nghiệp vụ tự định nghĩa (AppError) - đã biết trước, an toàn để lộ message
  if (err instanceof AppError) {
    logger.warn(`[${req.method} ${req.path}] ${err.message}`);
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // 2. Lỗi Prisma đã biết (VD: vi phạm unique constraint, không tìm thấy record)
  // Đây là chỗ dễ bị hỏi trong phỏng vấn: "Bạn xử lý lỗi trùng email
  // (unique constraint) ở tầng nào?" - Trả lời: bắt tại đây, mã lỗi P2002.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Dữ liệu đã tồn tại (vi phạm ràng buộc duy nhất)',
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu',
      });
    }
  }

  // 3. Lỗi không xác định (bug thật) - log đầy đủ nội bộ, KHÔNG lộ chi tiết ra ngoài
  logger.error(`[${req.method} ${req.path}] ${err.stack || err.message}`);

  return res.status(500).json({
    success: false,
    message: 'Đã có lỗi xảy ra, vui lòng thử lại sau',
    // chỉ lộ chi tiết lỗi khi đang dev, tuyệt đối không ở production
    ...(env.NODE_ENV === 'development' && { debug: err.message }),
  });
}

// Middleware bắt route không tồn tại (404) - đặt SAU mọi route,
// TRƯỚC errorMiddleware trong app.ts
export function notFoundMiddleware(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} không tồn tại`,
  });
}
