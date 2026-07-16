// src/middlewares/upload.middleware.ts
//
// memoryStorage: file được giữ tạm trong RAM (dạng Buffer), KHÔNG ghi
// xuống ổ đĩa server - phù hợp vì ta chỉ cần buffer đó để đẩy thẳng lên
// Cloudinary rồi bỏ đi, không cần lưu file tạm nào trên server (đúng
// nguyên tắc Phase 10.1: server không giữ file, mọi thứ đẩy ra
// object storage bên ngoài).

import multer from 'multer';
import { AppError } from '../utils/apiResponse';

const storage = multer.memoryStorage();

export const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // giới hạn 5MB - tránh upload file khổng lồ làm nghẽn server
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new AppError('Chỉ chấp nhận file ảnh JPEG, PNG hoặc WebP', 400));
    }
    cb(null, true);
  },
});
