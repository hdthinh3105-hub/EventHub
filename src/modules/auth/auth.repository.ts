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

  markEmailVerificationUsed(id: string) {
    return prisma.emailVerification.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  },

  markUserVerified(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { isVerified: true },
    });
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

  markPasswordResetUsed(id: string) {
    return prisma.passwordReset.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  },

  updatePassword(userId: string, passwordHash: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  },
};