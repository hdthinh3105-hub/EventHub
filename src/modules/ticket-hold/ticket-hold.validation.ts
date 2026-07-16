// src/modules/ticket-hold/ticket-hold.validation.ts
import { z } from 'zod';

export const createHoldSchema = z.object({
  ticketTypeId: z.string().uuid('ticketTypeId không hợp lệ'),
  quantity: z.number().int().positive('Số lượng vé phải lớn hơn 0').max(10, 'Tối đa 10 vé mỗi lần giữ chỗ'),
});

export type CreateHoldInput = z.infer<typeof createHoldSchema>;
