// src/modules/checkin/checkin.validation.ts
import { z } from 'zod';

export const checkinSchema = z.object({
  qrCode: z.string().min(1, 'Thiếu mã QR'),
});

export type CheckinInput = z.infer<typeof checkinSchema>;
