// src/modules/venue/venue.validation.ts
import { z } from 'zod';

export const createVenueSchema = z.object({
  name: z.string().min(2).max(150),
  address: z.string().min(5),
  city: z.string().min(2),
  capacity: z.number().int().positive().optional(),
});

export const updateVenueSchema = createVenueSchema.partial();

export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;
