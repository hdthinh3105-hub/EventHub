// src/middlewares/validate.middleware.ts
//
// Middleware TÁI SỬ DỤNG cho mọi module, không riêng auth - nhận vào
// 1 Zod schema, tự validate req.body, nếu sai trả lỗi 400 rõ ràng
// TRƯỚC KHI chạm vào Controller/Service - tách biệt hoàn toàn tầng
// validation khỏi tầng xử lý nghiệp vụ (đúng nguyên tắc SOLID -
// Single Responsibility).

import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';
import { AppError } from '../utils/apiResponse';

export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstError = result.error.issues[0];
      return next(new AppError(firstError?.message ?? 'Dữ liệu không hợp lệ', 400));
    }
    req.body = result.data;
    next();
  };
}
