// src/middlewares/auth.middleware.ts
//
// Middleware này sẽ được gắn vào MỌI route cần đăng nhập mới truy cập
// được (không riêng module auth) - đọc access token từ header
// "Authorization: Bearer <token>", verify chữ ký, gắn thông tin user
// vào req.user để Controller phía sau dùng được.

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { AppError } from '../utils/apiResponse';

// Mở rộng type Request của Express để có thêm field "user"
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Thiếu access token', 401));
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return next(new AppError('Token không hợp lệ', 401));
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new AppError('Access token không hợp lệ hoặc đã hết hạn', 401));
  }
}

// RBAC middleware - dùng SAU authMiddleware, kiểm tra role có nằm trong
// danh sách cho phép không. Cách dùng: router.get('/x', authMiddleware,
// requireRole('ADMIN', 'ORGANIZER'), controller.x)
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Chưa xác thực', 401));
    }
    if (!allowedRoles.includes(req.user.roleName)) {
      return next(new AppError('Bạn không có quyền thực hiện hành động này', 403));
    }
    next();
  };
}
