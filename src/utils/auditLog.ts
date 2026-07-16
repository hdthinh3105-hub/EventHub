// src/utils/auditLog.ts
//
// Đây là 1 trong số ít chỗ Service gọi thẳng "prisma" thay vì đi qua
// Repository riêng của module - CÓ CHỦ ĐÍCH, vì Audit Log là mối quan
// tâm XUYÊN SUỐT (cross-cutting concern), không thuộc về riêng module
// nào (Event, User, TicketType đều cần ghi log như nhau). Tạo 1
// AuditLogRepository riêng cho mỗi module sẽ chỉ là code trùng lặp.
//
// Nguyên tắc quan trọng: ghi log KHÔNG ĐƯỢC làm hỏng luồng chính. Nếu
// ghi audit log lỗi (VD DB tạm thời chậm), request vẫn phải thành công
// bình thường - audit log là "phụ", không phải điều kiện tiên quyết.

import { prisma } from '../config/database';
import { logger } from './logger';

interface AuditLogParams {
  userId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType: string; // "Event", "TicketType", "User"...
  entityId: string;
  oldValue?: unknown; // trạng thái TRƯỚC khi sửa (bỏ trống nếu là CREATE)
  newValue?: unknown; // trạng thái SAU khi sửa (bỏ trống nếu là DELETE)
}

export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        // JSON.parse(JSON.stringify(...)) khử các kiểu dữ liệu Prisma
        // không tự serialize được sang JSON thuần (VD Decimal, Date) -
        // tránh lỗi ngầm khi Postgres cố lưu vào cột kiểu JSONB.
        oldValue: params.oldValue ? JSON.parse(JSON.stringify(params.oldValue)) : undefined,
        newValue: params.newValue ? JSON.parse(JSON.stringify(params.newValue)) : undefined,
      },
    });
  } catch (err) {
    // Không throw lại - đúng nguyên tắc "phụ không được cản trở chính"
    // đã áp dụng nhất quán với Cache (Phase 8) và Socket.IO (Phase 11).
    logger.error(`[AuditLog] Lỗi ghi log ${params.action} ${params.entityType}:${params.entityId} - ${err}`);
  }
}
