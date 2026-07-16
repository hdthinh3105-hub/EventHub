// jest.config.js
//
// isolatedModules: true - đây là điểm mấu chốt sửa lỗi "Cannot find
// name describe/it/expect". Mặc định ts-jest chạy TypeScript Compiler
// đầy đủ (bao gồm kiểm tra TYPE, tôn trọng đúng "types" trong
// tsconfig.json - vốn bị giới hạn chỉ ["node"] để bảo vệ code sản
// phẩm). Bật isolatedModules chuyển ts-jest sang chế độ TRANSPILE THUẦN
// (giống Babel) - chỉ chuyển .ts -> .js, KHÔNG kiểm tra type/global
// nữa, nên không còn quan tâm "types" trong tsconfig có khai báo "jest"
// hay không. Đánh đổi: mất kiểm tra type khi chạy test (nếu code test
// có lỗi type thật sự, Jest không báo mà vẫn chạy) - chấp nhận được vì
// mục tiêu chính của các bài test này là kiểm chứng HÀNH VI runtime,
// không phải kiểm tra kiểu tĩnh (việc đó đã có "npx tsc --noEmit" lo).

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