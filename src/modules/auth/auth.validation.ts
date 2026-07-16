// src/modules/auth/auth.validation.ts
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z
    .string()
    .min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .regex(/[A-Z]/, 'Mật khẩu cần ít nhất 1 chữ hoa')
    .regex(/[0-9]/, 'Mật khẩu cần ít nhất 1 chữ số'),
  fullName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự'),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Thiếu refresh token'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Thiếu mã xác thực'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Thiếu mã đặt lại mật khẩu'),
  newPassword: z
    .string()
    .min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .regex(/[A-Z]/, 'Mật khẩu cần ít nhất 1 chữ hoa')
    .regex(/[0-9]/, 'Mật khẩu cần ít nhất 1 chữ số'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;