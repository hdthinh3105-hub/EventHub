// src/modules/auth/auth.service.ts
//
// Service chứa NGHIỆP VỤ THẬT: check trùng email, hash password, sinh
// token, quyết định khi nào throw lỗi gì. Controller sẽ KHÔNG chứa
// logic này - Controller chỉ nhận request, gọi Service, trả response.

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { authRepository } from './auth.repository';
import { AppError } from '../../utils/apiResponse';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { hashToken } from '../../utils/hashToken';
import { RegisterInput, LoginInput } from './auth.validation';
import { env } from '../../config/env';
import { publishVerificationEmail, publishPasswordResetEmail } from '../../queues/email.queue';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 giờ
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000; // 15 phút - ngắn hơn verify email vì
                                                // đây là thao tác nhạy cảm hơn (đổi mật khẩu)

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày, khớp JWT_REFRESH_EXPIRES_IN

function parseExpiresInToMs(expiresIn: string): number {
  // hỗ trợ format đơn giản "7d", "15m" - đủ dùng cho project này
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return REFRESH_TOKEN_TTL_MS;
  const [, num, unit] = match;
  const value = Number(num);
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as string]!;
  return value * multiplier;
}

async function issueTokens(user: { id: string; roleId: string; role: { name: string } }) {
  const payload = { userId: user.id, roleId: user.roleId, roleName: user.role.name };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt = new Date(Date.now() + parseExpiresInToMs(env.JWT_REFRESH_EXPIRES_IN));
  await authRepository.saveRefreshToken({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt,
  });

  return { accessToken, refreshToken };
}

export const authService = {
  async register(input: RegisterInput) {
    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) {
      throw new AppError('Email đã được sử dụng', 409);
    }

    const customerRole = await authRepository.findRoleByName('CUSTOMER');
    if (!customerRole) {
      // Lỗi hệ thống thật (thiếu seed data) - không phải lỗi user gây ra
      throw new AppError('Hệ thống chưa sẵn sàng, vui lòng thử lại sau', 500);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await authRepository.createUser({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      ...(input.phone !== undefined && { phone: input.phone }),
      roleId: customerRole.id,
    });

    const tokens = await issueTokens(user);

    // Sinh token xác thực email - lưu HASH vào DB (giống nguyên tắc với
    // refresh token ở Phase 4), gửi TOKEN GỐC (chưa hash) qua email vì
    // đó mới là thứ user cần dùng để verify - hash chỉ dùng để so sánh
    // phía server, không ai (kể cả DB bị lộ) suy ngược ra được token gốc.
    const verificationToken = crypto.randomBytes(32).toString('hex');
    await authRepository.saveEmailVerification({
      userId: user.id,
      tokenHash: hashToken(verificationToken),
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    });
    publishVerificationEmail(user.email, verificationToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role.name,
      },
      ...tokens,
    };
  },

  async login(input: LoginInput) {
    const user = await authRepository.findUserByEmail(input.email);
    // Cố tình dùng chung 1 thông báo lỗi cho cả 2 trường hợp "email không
    // tồn tại" và "sai mật khẩu" - tránh lộ thông tin email nào đã đăng ký
    // trong hệ thống (User Enumeration Attack) - câu hỏi phỏng vấn hay gặp.
    if (!user) {
      throw new AppError('Email hoặc mật khẩu không đúng', 401);
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Email hoặc mật khẩu không đúng', 401);
    }

    if (!user.isActive) {
      throw new AppError('Tài khoản đã bị khóa', 403);
    }

    const tokens = await issueTokens(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role.name,
      },
      ...tokens,
    };
  },

  async refresh(refreshToken: string) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError('Refresh token không hợp lệ hoặc đã hết hạn', 401);
    }

    const tokenHash = hashToken(refreshToken);
    const stored = await authRepository.findRefreshToken(tokenHash);
    if (!stored) {
      throw new AppError('Refresh token đã bị thu hồi', 401);
    }
    if (stored.expiresAt < new Date()) {
      throw new AppError('Refresh token đã hết hạn', 401);
    }

    const user = await authRepository.findUserById(payload.userId);
    if (!user) {
      throw new AppError('Người dùng không tồn tại', 401);
    }

    // Thu hồi refresh token cũ, phát hành cặp token mới (token rotation)
    // - hạn chế rủi ro nếu refresh token bị đánh cắp và dùng lại nhiều lần.
    await authRepository.revokeRefreshToken(tokenHash);
    const tokens = await issueTokens(user);

    return tokens;
  },

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    await authRepository.revokeRefreshToken(tokenHash);
  },

  async verifyEmail(token: string) {
    const tokenHash = hashToken(token);
    const record = await authRepository.findEmailVerification(tokenHash);
    if (!record) {
      throw new AppError('Mã xác thực không hợp lệ hoặc đã được sử dụng', 400);
    }
    if (record.expiresAt < new Date()) {
      throw new AppError('Mã xác thực đã hết hạn', 400);
    }

    // Transaction thật thay vì Promise.all - xem giải thích chi tiết
    // trong auth.repository.ts::verifyEmailTransactionally
    await authRepository.verifyEmailTransactionally({
      userId: record.userId,
      verificationId: record.id,
    });
  },

  async forgotPassword(email: string) {
    const user = await authRepository.findUserByEmail(email);
    // Cố tình KHÔNG throw lỗi nếu không tìm thấy email - luôn trả về
    // "thành công" như nhau dù email có tồn tại hay không. Đây là
    // nguyên tắc chống User Enumeration Attack giống hệt /login: nếu
    // trả lỗi "email không tồn tại", kẻ tấn công có thể dò ra danh sách
    // email đã đăng ký bằng cách thử hàng loạt địa chỉ.
    if (!user) return;

    const resetToken = crypto.randomBytes(32).toString('hex');
    await authRepository.savePasswordReset({
      userId: user.id,
      tokenHash: hashToken(resetToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });
    publishPasswordResetEmail(user.email, resetToken);
  },

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = hashToken(token);
    const record = await authRepository.findPasswordReset(tokenHash);
    if (!record) {
      throw new AppError('Mã đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng', 400);
    }
    if (record.expiresAt < new Date()) {
      throw new AppError('Mã đặt lại mật khẩu đã hết hạn', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Transaction thật gộp 3 việc: đổi mật khẩu + đánh dấu token đã
    // dùng + THU HỒI TOÀN BỘ refresh token đang hiệu lực của user này
    // (fix bảo mật quan trọng - xem giải thích trong auth.repository.ts).
    // Hệ quả: sau khi đổi mật khẩu thành công, MỌI thiết bị đang đăng
    // nhập (kể cả chính chủ) đều bị đăng xuất, phải login lại bằng
    // mật khẩu mới - đây là hành vi ĐÚNG và AN TOÀN, không phải bug.
    await authRepository.resetPasswordTransactionally({
      userId: record.userId,
      passwordHash,
      passwordResetId: record.id,
    });
  },
};