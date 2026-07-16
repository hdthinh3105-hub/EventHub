// src/modules/ticket-hold/ticket-hold.route.ts
import { Router } from 'express';
import { ticketHoldController } from './ticket-hold.controller';
import { authMiddleware, requireRole } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createHoldSchema } from './ticket-hold.validation';

const router = Router();

// Chỉ CUSTOMER được đặt/giữ vé - đúng ma trận phân quyền đã thiết kế
// từ Phase 5 (Organizer/Staff/Admin không mua vé qua luồng này).
router.post(
  '/',
  authMiddleware,
  requireRole('CUSTOMER'),
  validate(createHoldSchema),
  ticketHoldController.create,
);

export default router;
