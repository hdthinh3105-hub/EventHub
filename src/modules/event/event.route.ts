// src/modules/event/event.route.ts
import { Router } from 'express';
import { eventController } from './event.controller';
import { authMiddleware, requireRole } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { validateQuery } from '../../middlewares/validateQuery.middleware';
import { uploadImage } from '../../middlewares/upload.middleware';
import { createEventSchema, updateEventSchema, listEventQuerySchema } from './event.validation';

const router = Router();

// Đọc: PUBLIC - ai cũng tìm kiếm/xem sự kiện được, kể cả khách chưa đăng nhập
router.get('/', validateQuery(listEventQuerySchema), eventController.list);
router.get('/:id', eventController.getById);

// Ghi: cần đăng nhập + role ADMIN hoặc ORGANIZER (RBAC role-level).
// Quyền sở hữu cụ thể (Organizer chỉ sửa event của mình) được kiểm tra
// SÂU HƠN bên trong event.service.ts (Resource-based Authorization) -
// route/middleware không đủ thông tin để biết event này của ai.
router.post(
  '/',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER'),
  validate(createEventSchema),
  eventController.create,
);
router.patch(
  '/:id',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER'),
  validate(updateEventSchema),
  eventController.update,
);
router.delete('/:id', authMiddleware, requireRole('ADMIN', 'ORGANIZER'), eventController.remove);

// upload.single('image') - Multer đọc field tên "image" trong form-data,
// gắn kết quả vào req.file (buffer trong RAM), rồi mới chạy tới controller.
router.post(
  '/:id/image',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER'),
  uploadImage.single('image'),
  eventController.uploadImage,
);

export default router;