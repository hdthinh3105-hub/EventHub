// jest.config.js
//
// QUAN TRỌNG: "isolatedModules" ở đây (truyền cho ts-jest qua transform
// option) là MỘT THỨ HOÀN TOÀN KHÁC với "isolatedModules" trong
// tsconfig.json (compiler option gốc của TypeScript).
//
// - tsconfig.json > compilerOptions.isolatedModules: chỉ đảm bảo mỗi
//   file .ts biên dịch độc lập được (ràng buộc cú pháp), KHÔNG tắt
//   type-checking.
// - ts-jest's isolatedModules (đặt ở đây): bắt ts-jest chạy chế độ
//   TRANSPILE-ONLY (giống Babel) - bỏ HẲN bước kiểm tra type/global,
//   đây mới là thứ khiến global của Jest (describe/it/expect/jest...)
//   không bị báo lỗi "Cannot find name" khi tsconfig.json gốc (dùng
//   cho code sản phẩm trong src/) có "types": ["node"] và loại trừ
//   hẳn thư mục "tests" ra khỏi phạm vi biên dịch.
//
// Nhầm lẫn giữa 2 khái niệm trùng tên này là nguyên nhân của lỗi
// "Cannot find name 'jest'/'describe'/'it'/'expect'" khi cấu hình bị
// chuyển nhầm sang chỉ đặt trong tsconfig.json. ts-jest có cảnh báo
// deprecated cho cách khai báo dưới đây ở bản mới, nhưng đây vẫn LÀ
// CÁCH DUY NHẤT hoạt động đúng cho tới khi ts-jest hỗ trợ đầy đủ cách
// thay thế - ưu tiên "chạy đúng" hơn "hết cảnh báo".

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        isolatedModules: true,
      },
    ],
  },
};