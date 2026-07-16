// src/modules/checkin/checkin.route.ts
import { Router } from 'express';
import { checkinController } from './checkin.controller';
import { authMiddleware, requireRole } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { checkinSchema } from './checkin.validation';

const router = Router();

router.post(
  '/',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER', 'STAFF'),
  validate(checkinSchema),
  checkinController.checkin,
);

export default router;
