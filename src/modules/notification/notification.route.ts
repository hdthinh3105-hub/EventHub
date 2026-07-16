// src/modules/notification/notification.route.ts
import { Router } from 'express';
import { notificationController } from './notification.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();

// Không cần requireRole - MỌI role đã đăng nhập đều được xem thông báo
// CỦA CHÍNH MÌNH (kiểm tra sở hữu nằm trong Service, không phải role).
router.get('/', authMiddleware, notificationController.list);
router.patch('/:id/read', authMiddleware, notificationController.markRead);

export default router;
