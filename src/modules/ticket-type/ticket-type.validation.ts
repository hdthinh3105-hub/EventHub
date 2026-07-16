// src/modules/ticket-type/ticket-type.validation.ts
import { z } from 'zod';

// Cố tình KHÔNG có "soldQuantity" trong schema này - đây là dữ liệu chỉ
// server được phép thay đổi (qua giao dịch mua vé thật ở Phase 7),
// không bao giờ nhận trực tiếp từ client dù ở create hay update.
export const createTicketTypeSchema = z.object({
  name: z.string().min(2, 'Tên loại vé tối thiểu 2 ký tự').max(100),
  price: z.number().nonnegative('Giá vé không được âm'),
  totalQuantity: z.number().int().positive('Số lượng vé phải lớn hơn 0'),
});

export const updateTicketTypeSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  price: z.number().nonnegative().optional(),
  // Cho phép sửa totalQuantity NHƯNG Service sẽ chặn nếu giảm xuống
  // thấp hơn soldQuantity hiện tại - xem giải thích trong ticket-type.service.ts
  totalQuantity: z.number().int().positive().optional(),
});

export type CreateTicketTypeInput = z.infer<typeof createTicketTypeSchema>;
export type UpdateTicketTypeInput = z.infer<typeof updateTicketTypeSchema>;
