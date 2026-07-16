// src/middlewares/uploadExcel.middleware.ts
import multer from 'multer';
import { AppError } from '../utils/apiResponse';

const storage = multer.memoryStorage();

export const uploadExcel = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new AppError('Chỉ chấp nhận file Excel (.xlsx, .xls)', 400));
    }
    cb(null, true);
  },
});
