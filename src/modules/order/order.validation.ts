// src/modules/order/order.validation.ts
import { z } from 'zod';

export const checkoutSchema = z.object({
  holdId: z.string().uuid('holdId không hợp lệ'),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
