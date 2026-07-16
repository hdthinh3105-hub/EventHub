// src/modules/event-staff/event-staff.route.ts
import { Router } from 'express';
import { eventStaffController } from './event-staff.controller';
import { authMiddleware, requireRole } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { assignStaffSchema } from './event-staff.validation';

const router = Router();

router.get(
  '/event/:eventId',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER'),
  eventStaffController.list,
);

router.post(
  '/event/:eventId',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER'),
  validate(assignStaffSchema),
  eventStaffController.assign,
);

router.delete(
  '/event/:eventId/user/:userId',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER'),
  eventStaffController.remove,
);

export default router;
