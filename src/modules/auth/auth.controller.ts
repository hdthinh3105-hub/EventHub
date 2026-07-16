// src/modules/auth/auth.controller.ts
import { Request, Response } from 'express';
import { authService } from './auth.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body);
    res.status(201).json(ApiResponse.success(result, 'Đăng ký thành công'));
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body);
    res.status(200).json(ApiResponse.success(result, 'Đăng nhập thành công'));
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.refresh(req.body.refreshToken);
    res.status(200).json(ApiResponse.success(result, 'Làm mới token thành công'));
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    await authService.logout(req.body.refreshToken);
    res.status(200).json(ApiResponse.success(null, 'Đăng xuất thành công'));
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    // req.user được gắn vào bởi auth.middleware.ts (xem file middleware)
    res.status(200).json(ApiResponse.success(req.user, 'Lấy thông tin thành công'));
  }),

  verifyEmail: asyncHandler(async (req: Request, res: Response) => {
    await authService.verifyEmail(req.body.token);
    res.status(200).json(ApiResponse.success(null, 'Xác thực email thành công'));
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    await authService.forgotPassword(req.body.email);
    // Luôn trả về cùng 1 message dù email có tồn tại hay không - chống
    // User Enumeration Attack (giải thích chi tiết trong auth.service.ts)
    res
      .status(200)
      .json(ApiResponse.success(null, 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi'));
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    await authService.resetPassword(req.body.token, req.body.newPassword);
    res.status(200).json(ApiResponse.success(null, 'Đặt lại mật khẩu thành công'));
  }),
};