// src/modules/event-staff/event-staff.validation.ts
import { z } from 'zod';

export const assignStaffSchema = z.object({
  userId: z.string().uuid('userId không hợp lệ'),
});

export type AssignStaffInput = z.infer<typeof assignStaffSchema>;
