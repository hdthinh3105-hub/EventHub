// prisma/seed.ts
//
// Nguyên tắc: seed chỉ tạo dữ liệu THAM CHIẾU (roles, categories, venues)
// và 1-2 user demo để test đăng nhập. KHÔNG seed dữ liệu nghiệp vụ lớn
// (events, tickets...) - dữ liệu đó nên tạo qua chính API bạn sắp viết,
// vì đó cũng là cách bạn tự kiểm thử API của mình (dogfooding).
//
// dùng upsert thay vì create: chạy seed nhiều lần không bị lỗi trùng
// unique constraint (email, role name...) - seed phải IDEMPOTENT,
// nghĩa là chạy 1 lần hay 10 lần kết quả cuối cùng như nhau.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Bắt đầu seed dữ liệu...');

  // 1. Roles - bảng nền tảng, mọi User đều phải có 1 role hợp lệ
  const roleNames = ['ADMIN', 'ORGANIZER', 'STAFF', 'CUSTOMER'];
  const roles: Record<string, { id: string }> = {};

  for (const name of roleNames) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    roles[name] = role;
  }
  console.log('Đã tạo 4 roles');

  // 2. Categories
  const categoryNames = ['Âm nhạc', 'Hội thảo', 'Thể thao', 'Nghệ thuật', 'Công nghệ'];
  for (const name of categoryNames) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log('Đã tạo categories');

  // 3. Venues
  const venues = [
    { name: 'Nhà hát Hòa Bình', address: '240 Đ. 3/2', city: 'TP.HCM', capacity: 2000 },
    { name: 'Trung tâm Hội nghị White Palace', address: '108 Phạm Văn Đồng', city: 'TP.HCM', capacity: 1500 },
    { name: 'SVĐ Mỹ Đình', address: 'Đ. Lê Đức Thọ', city: 'Hà Nội', capacity: 40000 },
  ];
  for (const v of venues) {
    const existing = await prisma.venue.findFirst({ where: { name: v.name } });
    if (!existing) {
      await prisma.venue.create({ data: v });
    }
  }
  console.log('Đã tạo venues');

  // 4. User demo cho từng role - để bạn test Login/Auth ngay ở Phase 4
  // mật khẩu demo: Password123! (đã hash, KHÔNG BAO GIỜ lưu plaintext)
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const demoUsers = [
    { email: 'admin@eventhub.vn', fullName: 'Admin Demo', role: 'ADMIN' },
    { email: 'organizer@eventhub.vn', fullName: 'Organizer Demo', role: 'ORGANIZER' },
    { email: 'staff@eventhub.vn', fullName: 'Staff Demo', role: 'STAFF' },
    { email: 'customer@eventhub.vn', fullName: 'Customer Demo', role: 'CUSTOMER' },
  ];

  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        fullName: u.fullName,
        passwordHash,
        isVerified: true, // seed data bỏ qua bước verify email cho tiện test
        roleId: roles[u.role]!.id,
      },
    });
  }
  console.log('Đã tạo 4 user demo (mật khẩu: Password123!)');

  console.log('Seed hoàn tất.');
}

main()
  .catch((e) => {
    console.error('Seed thất bại:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
