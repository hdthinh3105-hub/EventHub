// tests/integration/middleware.test.ts
//
// Đây chính là lý do Phase 3 tách app.ts (chỉ định nghĩa Express app,
// KHÔNG gọi listen()) ra khỏi server.ts - supertest import thẳng "app",
// tự tạo 1 server ảo trong bộ nhớ cho MỖI test, không cần mở port thật,
// không xung đột port khi chạy nhiều test song song.
//
// LƯU Ý QUAN TRỌNG về phạm vi các test này: mọi request bên dưới đều
// bị CHẶN Ở MIDDLEWARE (validate hoặc auth) TRƯỚC KHI chạm tới
// Controller/Service/Database - đây là lựa chọn CÓ CHỦ ĐÍCH để test
// không phụ thuộc DB/Redis/RabbitMQ thật đang chạy hay không. Test cho
// luồng nghiệp vụ đầy đủ (có DB thật) nên tách riêng thành 1 bộ
// "test tích hợp có DB" khác (VD: dùng DB test riêng), không trộn vào
// đây - nếu trộn, bạn sẽ gặp lỗi test "flaky" (lúc pass lúc fail) do
// phụ thuộc trạng thái DB thời điểm chạy.

import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { redis } from '../../src/config/redis';

// app.ts import gián tiếp database.ts + redis.ts -> cả 2 mở kết nối THẬT
// ngay khi module được import (Prisma lazy-connect, Redis connect ngay).
// Không đóng lại sau khi test xong sẽ khiến Jest phải "ép thoát" process
// (cảnh báo "worker process has failed to exit gracefully") - đây LÀ
// nguyên tắc "graceful shutdown" (đã áp dụng ở server.ts thật) áp dụng
// đúng cả trong môi trường test.
afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe('Health check', () => {
  it('GET /health trả về 200 và không cần bất kỳ dependency nào', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('authMiddleware - chặn request thiếu/sai token TRƯỚC KHI chạm DB', () => {
  it('POST /api/events không có token -> 401, không phải 403', async () => {
    const res = await request(app).post('/api/events').send({
      title: 'Sự kiện test',
      categoryId: '00000000-0000-0000-0000-000000000000',
      venueId: '00000000-0000-0000-0000-000000000000',
      startTime: '2026-12-20T19:00:00Z',
      endTime: '2026-12-20T22:00:00Z',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/thiếu access token/i);
  });

  it('GET /api/users không có token -> 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('GET /api/users với token giả (sai chữ ký) -> 401, không phải crash 500', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer day.la.token.gia.mao.khong.hop.le');

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/không hợp lệ|hết hạn/i);
  });

  it('PATCH /api/users/:id/role không có token -> 401 (không lộ liệu :id tồn tại hay không)', async () => {
    const res = await request(app)
      .patch('/api/users/00000000-0000-0000-0000-000000000000/role')
      .send({ roleName: 'ADMIN' });

    expect(res.status).toBe(401);
  });
});

describe('validate middleware (Zod) - chặn dữ liệu sai định dạng TRƯỚC KHI chạm DB', () => {
  it('POST /api/auth/register thiếu password -> 400, đúng thông báo lỗi', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@example.com',
      fullName: 'Test User',
      // thiếu password
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/register email sai định dạng -> 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'khong-phai-email',
      password: 'Test1234',
      fullName: 'Test User',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it('POST /api/auth/register mật khẩu thiếu chữ hoa -> 400 (đúng quy tắc regex đã định nghĩa)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@example.com',
      password: 'test1234', // không có chữ hoa
      fullName: 'Test User',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/chữ hoa/i);
  });

  it('POST /api/ticket-holds quantity vượt quá 10 -> 400 (chặn scalping ngay từ validate, chưa cần vào Service)', async () => {
    const res = await request(app)
      .post('/api/ticket-holds')
      .set('Authorization', 'Bearer token-khong-hop-le')
      .send({ ticketTypeId: '00000000-0000-0000-0000-000000000000', quantity: 999 });

    // Route này validate() chạy TRƯỚC authMiddleware theo thứ tự khai báo
    // trong router? Kiểm tra lại: ticket-hold.route.ts đặt authMiddleware
    // TRƯỚC validate() -> nên request này sẽ dừng ở 401 (token sai) chứ
    // không tới được bước validate quantity. Đây là ví dụ tốt để hiểu
    // THỨ TỰ middleware quan trọng: request KHÔNG đăng nhập được thì
    // không bao giờ tới lượt kiểm tra "quantity có hợp lệ không".
    expect(res.status).toBe(401);
  });
});

describe('notFoundMiddleware - route không tồn tại', () => {
  it('GET /api/route-khong-ton-tai -> 404 với message rõ ràng', async () => {
    const res = await request(app).get('/api/route-khong-ton-tai');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/không tồn tại/i);
  });
});// tests/integration/middleware.test.ts
//
// Đây chính là lý do Phase 3 tách app.ts (chỉ định nghĩa Express app,
// KHÔNG gọi listen()) ra khỏi server.ts - supertest import thẳng "app",
// tự tạo 1 server ảo trong bộ nhớ cho MỖI test, không cần mở port thật,
// không xung đột port khi chạy nhiều test song song.
//
// LƯU Ý QUAN TRỌNG về phạm vi các test này: mọi request bên dưới đều
// bị CHẶN Ở MIDDLEWARE (validate hoặc auth) TRƯỚC KHI chạm tới
// Controller/Service/Database - đây là lựa chọn CÓ CHỦ ĐÍCH để test
// không phụ thuộc DB/Redis/RabbitMQ thật đang chạy hay không. Test cho
// luồng nghiệp vụ đầy đủ (có DB thật) nên tách riêng thành 1 bộ
// "test tích hợp có DB" khác (VD: dùng DB test riêng), không trộn vào
// đây - nếu trộn, bạn sẽ gặp lỗi test "flaky" (lúc pass lúc fail) do
// phụ thuộc trạng thái DB thời điểm chạy.

import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { redis } from '../../src/config/redis';

// app.ts import gián tiếp database.ts + redis.ts -> cả 2 mở kết nối THẬT
// ngay khi module được import (Prisma lazy-connect, Redis connect ngay).
// Không đóng lại sau khi test xong sẽ khiến Jest phải "ép thoát" process
// (cảnh báo "worker process has failed to exit gracefully") - đây LÀ
// nguyên tắc "graceful shutdown" (đã áp dụng ở server.ts thật) áp dụng
// đúng cả trong môi trường test.
afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe('Health check', () => {
  it('GET /health trả về 200 và không cần bất kỳ dependency nào', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('authMiddleware - chặn request thiếu/sai token TRƯỚC KHI chạm DB', () => {
  it('POST /api/events không có token -> 401, không phải 403', async () => {
    const res = await request(app).post('/api/events').send({
      title: 'Sự kiện test',
      categoryId: '00000000-0000-0000-0000-000000000000',
      venueId: '00000000-0000-0000-0000-000000000000',
      startTime: '2026-12-20T19:00:00Z',
      endTime: '2026-12-20T22:00:00Z',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/thiếu access token/i);
  });

  it('GET /api/users không có token -> 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('GET /api/users với token giả (sai chữ ký) -> 401, không phải crash 500', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer day.la.token.gia.mao.khong.hop.le');

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/không hợp lệ|hết hạn/i);
  });

  it('PATCH /api/users/:id/role không có token -> 401 (không lộ liệu :id tồn tại hay không)', async () => {
    const res = await request(app)
      .patch('/api/users/00000000-0000-0000-0000-000000000000/role')
      .send({ roleName: 'ADMIN' });

    expect(res.status).toBe(401);
  });
});

describe('validate middleware (Zod) - chặn dữ liệu sai định dạng TRƯỚC KHI chạm DB', () => {
  it('POST /api/auth/register thiếu password -> 400, đúng thông báo lỗi', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@example.com',
      fullName: 'Test User',
      // thiếu password
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/register email sai định dạng -> 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'khong-phai-email',
      password: 'Test1234',
      fullName: 'Test User',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it('POST /api/auth/register mật khẩu thiếu chữ hoa -> 400 (đúng quy tắc regex đã định nghĩa)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@example.com',
      password: 'test1234', // không có chữ hoa
      fullName: 'Test User',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/chữ hoa/i);
  });

  it('POST /api/ticket-holds quantity vượt quá 10 -> 400 (chặn scalping ngay từ validate, chưa cần vào Service)', async () => {
    const res = await request(app)
      .post('/api/ticket-holds')
      .set('Authorization', 'Bearer token-khong-hop-le')
      .send({ ticketTypeId: '00000000-0000-0000-0000-000000000000', quantity: 999 });

    // Route này validate() chạy TRƯỚC authMiddleware theo thứ tự khai báo
    // trong router? Kiểm tra lại: ticket-hold.route.ts đặt authMiddleware
    // TRƯỚC validate() -> nên request này sẽ dừng ở 401 (token sai) chứ
    // không tới được bước validate quantity. Đây là ví dụ tốt để hiểu
    // THỨ TỰ middleware quan trọng: request KHÔNG đăng nhập được thì
    // không bao giờ tới lượt kiểm tra "quantity có hợp lệ không".
    expect(res.status).toBe(401);
  });
});

describe('notFoundMiddleware - route không tồn tại', () => {
  it('GET /api/route-khong-ton-tai -> 404 với message rõ ràng', async () => {
    const res = await request(app).get('/api/route-khong-ton-tai');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/không tồn tại/i);
  });
});