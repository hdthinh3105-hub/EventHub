// src/modules/venue/venue.route.ts
import { Router } from 'express';
import { venueController } from './venue.controller';
import { authMiddleware, requireRole } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createVenueSchema, updateVenueSchema } from './venue.validation';

const router = Router();

router.get('/', venueController.list);
router.post('/', authMiddleware, requireRole('ADMIN'), validate(createVenueSchema), venueController.create);
router.patch('/:id', authMiddleware, requireRole('ADMIN'), validate(updateVenueSchema), venueController.update);
router.delete('/:id', authMiddleware, requireRole('ADMIN'), venueController.remove);

export default router;
