// src/middlewares/validateQuery.middleware.ts
//
// Tách riêng khỏi validate.middleware.ts (validate req.body) vì
// req.query là object CHỈ ĐỌC (readonly) trong Express 5 - không thể
// gán req.query = parsed.data như cách làm với body. Thay vào đó, ta
// gắn kết quả đã parse (đã ép kiểu number, có default) vào 1 field
// riêng req.validatedQuery để Controller dùng, tránh đụng vào req.query gốc.

import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';
import { AppError } from '../utils/apiResponse';

declare global {
  namespace Express {
    interface Request {
      validatedQuery?: Record<string, unknown>;
    }
  }
}

export function validateQuery(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const firstError = result.error.issues[0];
      return next(new AppError(firstError?.message ?? 'Query params không hợp lệ', 400));
    }
    req.validatedQuery = result.data as Record<string, unknown>;
    next();
  };
}
