// src/modules/ticket-type/ticket-type.route.ts
import { Router } from 'express';
import { ticketTypeController } from './ticket-type.controller';
import { authMiddleware, requireRole } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createTicketTypeSchema, updateTicketTypeSchema } from './ticket-type.validation';

const router = Router();

// Đọc: PUBLIC - khách xem sự kiện cần thấy ngay các loại vé + giá
router.get('/event/:eventId', ticketTypeController.listByEvent);

// Ghi: ADMIN/ORGANIZER ở role-level, quyền sở hữu cụ thể (Event này của
// ai) được kiểm tra sâu trong ticket-type.service.ts qua assertCanModifyEvent
router.post(
  '/event/:eventId',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER'),
  validate(createTicketTypeSchema),
  ticketTypeController.create,
);

router.patch(
  '/:id',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER'),
  validate(updateTicketTypeSchema),
  ticketTypeController.update,
);

router.delete('/:id', authMiddleware, requireRole('ADMIN', 'ORGANIZER'), ticketTypeController.remove);

export default router;
