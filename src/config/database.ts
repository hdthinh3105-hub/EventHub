// src/config/database.ts
//
// Tại sao cần "singleton" pattern ở đây, không new PrismaClient() tự do
// mỗi nơi cần dùng?
// Mỗi lần "new PrismaClient()" sẽ mở 1 connection pool riêng tới Postgres.
// Trong dev, "tsx watch" reload code liên tục mỗi lần bạn save file ->
// nếu không singleton, mỗi lần reload lại tạo thêm 1 pool mới, rất nhanh
// sẽ làm cạn kiệt số connection cho phép của Neon free tier (thường giới
// hạn khá thấp, vài chục connection). Đây là lỗi rất hay gặp và khó hiểu
// với Junior: "sao chạy vài lần là báo lỗi too many connections".

import { PrismaClient } from '@prisma/client';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}
