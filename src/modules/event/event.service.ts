// src/modules/event/event.service.ts
import { eventRepository } from './event.repository';
import { categoryRepository } from '../category/category.repository';
import { venueRepository } from '../venue/venue.repository';
import { AppError } from '../../utils/apiResponse';
import { CreateEventInput, UpdateEventInput, ListEventQuery } from './event.validation';
import { JwtPayload } from '../../utils/jwt';
import { getOrSetCache, invalidateCache } from '../../utils/cache';
import { uploadBufferToCloudinary } from '../../utils/uploadImage';
import { writeAuditLog } from '../../utils/auditLog';

const LIST_CACHE_TTL = 60; // 60s - danh sách event thay đổi không quá thường xuyên
const DETAIL_CACHE_TTL = 120; // 120s - trang chi tiết ít bị sửa hơn danh sách

// Hàm dùng chung: kiểm tra quyền sở hữu Event.
// Đây chính là "Resource-based Authorization" - khác với requireRole
// (chỉ biết role), hàm này biết CỤ THỂ ai sở hữu resource nào.
// ADMIN được bỏ qua kiểm tra vì Admin quản lý toàn hệ thống.
export function assertCanModifyEvent(
  event: { organizerId: string },
  user: JwtPayload,
) {
  if (user.roleName === 'ADMIN') return;
  if (event.organizerId !== user.userId) {
    throw new AppError('Bạn không có quyền chỉnh sửa sự kiện này', 403);
  }
}

export const eventService = {
  async list(query: ListEventQuery) {
    // Cache key PHẢI bao gồm mọi tham số ảnh hưởng tới kết quả - khác
    // trang, khác filter thì phải là cache key khác, nếu không user A
    // filter theo category X sẽ vô tình thấy cache của category Y.
    const cacheKey = `events:list:${JSON.stringify(query)}`;

    return getOrSetCache(cacheKey, LIST_CACHE_TTL, async () => {
      const { items, total } = await eventRepository.findMany(query);
      return {
        items,
        meta: { page: query.page, limit: query.limit, total },
      };
    });
  },

  async getById(id: string) {
    const cacheKey = `events:detail:${id}`;

    const event = await getOrSetCache(cacheKey, DETAIL_CACHE_TTL, () =>
      eventRepository.findById(id),
    );

    if (!event) {
      throw new AppError('Không tìm thấy sự kiện', 404);
    }
    return event;
  },

  async create(input: CreateEventInput, user: JwtPayload) {
    const [category, venue] = await Promise.all([
      categoryRepository.findById(input.categoryId),
      venueRepository.findById(input.venueId),
    ]);
    if (!category) throw new AppError('Category không tồn tại', 404);
    if (!venue) throw new AppError('Venue không tồn tại', 404);

    const event = await eventRepository.create({ ...input, organizerId: user.userId });

    // Có Event mới -> mọi cache danh sách hiện tại đã LỖI THỜI (thiếu
    // event mới này) -> xóa hết để lần đọc tiếp theo cache lại từ đầu.
    await invalidateCache('events:list:*');

    // Ghi audit log KHÔNG "await" chặn response - đẩy xử lý xong xuôi
    // rồi mới ghi, không delay client vì tác vụ phụ này.
    void writeAuditLog({
      userId: user.userId,
      action: 'CREATE',
      entityType: 'Event',
      entityId: event.id,
      newValue: event,
    });

    return event;
  },

  async update(id: string, input: UpdateEventInput, user: JwtPayload) {
    const event = await eventRepository.findById(id);
    if (!event) {
      throw new AppError('Không tìm thấy sự kiện', 404);
    }

    assertCanModifyEvent(event, user);

    if (input.endTime && input.startTime && input.endTime <= input.startTime) {
      throw new AppError('Thời gian kết thúc phải sau thời gian bắt đầu', 400);
    }

    const updated = await eventRepository.update(id, input);

    // Xóa CẢ cache chi tiết của đúng event này LẪN mọi cache danh sách
    // (vì event có thể đổi status/title làm nó xuất hiện/biến mất khỏi
    // 1 trang danh sách có filter cụ thể).
    await Promise.all([
      invalidateCache(`events:detail:${id}`),
      invalidateCache('events:list:*'),
    ]);

    // Ghi lại CẢ giá trị cũ lẫn mới - đây chính là giá trị thật của
    // Audit Log so với chỉ ghi "đã sửa": khi có tranh chấp (VD Organizer
    // khiếu nại "tôi không đổi giá vé"), bạn tra được CHÍNH XÁC đã đổi
    // từ gì sang gì, ai đổi, lúc nào.
    void writeAuditLog({
      userId: user.userId,
      action: 'UPDATE',
      entityType: 'Event',
      entityId: id,
      oldValue: event,
      newValue: updated,
    });

    return updated;
  },

  async remove(id: string, user: JwtPayload) {
    const event = await eventRepository.findById(id);
    if (!event) {
      throw new AppError('Không tìm thấy sự kiện', 404);
    }

    assertCanModifyEvent(event, user);

    const result = await eventRepository.softDelete(id);

    await Promise.all([
      invalidateCache(`events:detail:${id}`),
      invalidateCache('events:list:*'),
    ]);

    void writeAuditLog({
      userId: user.userId,
      action: 'DELETE',
      entityType: 'Event',
      entityId: id,
      oldValue: event,
    });

    return result;
  },

  async uploadCoverImage(id: string, fileBuffer: Buffer, user: JwtPayload) {
    const event = await eventRepository.findById(id);
    if (!event) {
      throw new AppError('Không tìm thấy sự kiện', 404);
    }

    // Cùng cơ chế Resource-based Authorization đã dùng cho update/remove -
    // chỉ chủ sự kiện (hoặc Admin) mới được đổi ảnh bìa.
    assertCanModifyEvent(event, user);

    const { url } = await uploadBufferToCloudinary(fileBuffer, 'eventhub/events');

    const updated = await eventRepository.updateCoverImage(id, url);

    await Promise.all([
      invalidateCache(`events:detail:${id}`),
      invalidateCache('events:list:*'),
    ]);

    return updated;
  },
};