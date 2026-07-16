// src/utils/hashToken.ts
//
// Dùng SHA-256 (không phải bcrypt) cho refresh token vì token đã tự nó
// là chuỗi ngẫu nhiên entropy cao (không phải password người dùng tự
// nghĩ ra, dễ đoán) - không cần thuật toán chậm/tốn CPU như bcrypt,
// chỉ cần 1 chiều không đảo ngược được là đủ.

import crypto from 'crypto';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
