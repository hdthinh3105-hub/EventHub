// src/modules/user/user.validation.ts
import { z } from 'zod';

export const assignRoleSchema = z.object({
  roleName: z.enum(['ADMIN', 'ORGANIZER', 'STAFF', 'CUSTOMER']),
});

export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
