// src/modules/category/category.route.ts
import { Router } from 'express';
import { categoryController } from './category.controller';
import { authMiddleware, requireRole } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createCategorySchema, updateCategorySchema } from './category.validation';

const router = Router();

// Đọc: PUBLIC - ai cũng xem được danh sách category (kể cả chưa đăng nhập),
// vì đây là dữ liệu hiển thị công khai trên trang tìm kiếm sự kiện.
router.get('/', categoryController.list);

// Ghi: chỉ ADMIN - category là dữ liệu nền tảng, không phải Organizer nào
// cũng được tự ý tạo, tránh loạn danh mục (VD: "Nhạc" và "Âm nhạc" trùng ý).
router.post('/', authMiddleware, requireRole('ADMIN'), validate(createCategorySchema), categoryController.create);
router.patch('/:id', authMiddleware, requireRole('ADMIN'), validate(updateCategorySchema), categoryController.update);
router.delete('/:id', authMiddleware, requireRole('ADMIN'), categoryController.remove);

export default router;
