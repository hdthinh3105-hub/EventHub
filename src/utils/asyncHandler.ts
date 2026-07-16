// src/utils/asyncHandler.ts
//
// Vấn đề: Express KHÔNG tự bắt lỗi từ async function. Nếu bạn viết
// controller async mà quên try-catch, lỗi sẽ làm server bị "treo"
// request đó mãi mãi (không response, không crash, không log) -
// đây là lỗi rất khó phát hiện trong production.
//
// Giải pháp: bọc mọi controller qua asyncHandler, tự động catch lỗi
// và chuyển cho error middleware xử lý tập trung (Phase 3.9), thay vì
// phải viết try-catch lặp lại ở TỪNG controller.

import { Request, Response, NextFunction, RequestHandler } from 'express';

export const asyncHandler = (fn: RequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
