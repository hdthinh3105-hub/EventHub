// src/modules/auth/auth.repository.ts
//
// Repository Pattern: đây là lớp DUY NHẤT trong module auth được phép
// gọi Prisma trực tiếp. Service KHÔNG BAO GIỜ import prisma - luôn đi
// qua Repository. Lợi ích: nếu sau này đổi ORM (Prisma -> TypeORM) hoặc
// cần viết Unit Test cho Service (mock Repository, không cần DB thật),
// bạn chỉ sửa/mock đúng 1 lớp này.

import { prisma } from '../../config/database';

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
  },

  findRoleByName(name: string) {
    return prisma.role.findUnique({ where: { name } });
  },

  createUser(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    phone?: string;
    roleId: string;
  }) {
    return prisma.user.create({
      data,
      include: { role: true },
    });
  },

  saveRefreshToken(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return prisma.refreshToken.create({ data });
  },

  findRefreshToken(tokenHash: string) {
    return prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
    });
  },

  revokeRefreshToken(tokenHash: string) {
    return prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  },

  // --- Email Verification ---
  saveEmailVerification(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return prisma.emailVerification.create({ data });
  },

  findEmailVerification(tokenHash: string) {
    return prisma.emailVerification.findFirst({
      where: { tokenHash, usedAt: null },
    });
  },

  // Gộp "đánh dấu user đã xác thực" + "đánh dấu token đã dùng" vào 1
  // TRANSACTION THẬT (không phải Promise.all riêng lẻ như bản trước) -
  // đảm bảo CẢ 2 cùng thành công hoặc CẢ 2 cùng thất bại. Nếu chỉ dùng
  // Promise.all, có tình huống hiếm nhưng có thật: câu update đầu
  // thành công, câu thứ 2 lỗi (VD DB tạm gián đoạn) - token vẫn ở
  // trạng thái "chưa dùng", có thể bị verify lại lần nữa trong thời
  // gian còn hiệu lực (24h) dù user đã được đánh dấu isVerified rồi -
  // không gây hại nghiêm trọng nhưng là điểm không nhất quán dữ liệu.
  verifyEmailTransactionally(params: { userId: string; verificationId: string }) {
    return prisma.$transaction([
      prisma.user.update({ where: { id: params.userId }, data: { isVerified: true } }),
      prisma.emailVerification.update({
        where: { id: params.verificationId },
        data: { usedAt: new Date() },
      }),
    ]);
  },

  // --- Password Reset ---
  savePasswordReset(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return prisma.passwordReset.create({ data });
  },

  findPasswordReset(tokenHash: string) {
    return prisma.passwordReset.findFirst({
      where: { tokenHash, usedAt: null },
    });
  },

  // Gộp 3 thao tác vào 1 TRANSACTION THẬT: (1) đổi mật khẩu, (2) đánh
  // dấu token reset đã dùng, (3) THU HỒI TOÀN BỘ refresh token đang
  // hiệu lực của user này. Điểm (3) là fix bảo mật quan trọng phát
  // hiện được từ thực tế: trước đây resetPassword đổi mật khẩu xong
  // nhưng KHÔNG thu hồi session cũ - nếu tài khoản bị chiếm đoạt và
  // chủ tài khoản đổi mật khẩu để "đuổi" kẻ xâm nhập, kẻ đó vẫn giữ
  // được refreshToken cũ, tiếp tục gọi /auth/refresh lấy access token
  // mới, VẪN TRUY CẬP ĐƯỢC dù mật khẩu đã đổi. Đổi mật khẩu PHẢI đồng
  // nghĩa với "đăng xuất mọi nơi", đây là hành vi chuẩn của mọi hệ
  // thống nghiêm túc (Google, Facebook đều làm vậy).
  resetPasswordTransactionally(params: {
    userId: string;
    passwordHash: string;
    passwordResetId: string;
  }) {
    return prisma.$transaction([
      prisma.user.update({
        where: { id: params.userId },
        data: { passwordHash: params.passwordHash },
      }),
      prisma.passwordReset.update({
        where: { id: params.passwordResetId },
        data: { usedAt: new Date() },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: params.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  },
};