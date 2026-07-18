// src/modules/event/event.service.ts
import { eventRepository } from './event.repository';
import { categoryRepository } from '../category/category.repository';
import { venueRepository } from '../venue/venue.repository';
import { ticketTypeRepository } from '../ticket-type/ticket-type.repository';
import { AppError } from '../../utils/apiResponse';
import { CreateEventInput, UpdateEventInput, ListEventQuery } from './event.validation';
import { JwtPayload } from '../../utils/jwt';
import { getOrSetCache, invalidateCache } from '../../utils/cache';
import { uploadBufferToCloudinary } from '../../utils/uploadImage';
import { writeAuditLog } from '../../utils/auditLog';

const LIST_CACHE_TTL = 60;
const DETAIL_CACHE_TTL = 120;

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

    await invalidateCache('events:list:*');

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

    // --- Fix lỗ hổng phát hiện được ---
    // Bản trước CHỈ kiểm tra "endTime <= startTime" khi CẢ HAI field
    // cùng có mặt trong body PATCH. Nếu Organizer chỉ gửi 1 trong 2
    // field (VD chỉ sửa endTime), điều kiện bị bỏ qua hoàn toàn vì
    // input.startTime là undefined - cho phép lưu 1 khoảng thời gian
    // vô lý (endTime trước startTime ĐÃ LƯU SẴN trong DB) mà không hề
    // hay biết. Sửa đúng bằng cách LUÔN so sánh với giá trị HIỆN CÓ
    // trong DB nếu field đó không được gửi lên - đây chính là nguyên
    // tắc "validate dựa trên trạng thái CUỐI CÙNG sau khi áp dụng thay
    // đổi", không phải chỉ validate riêng lẻ các field mới gửi lên.
    if (input.startTime !== undefined || input.endTime !== undefined) {
      const effectiveStart = input.startTime ?? event.startTime;
      const effectiveEnd = input.endTime ?? event.endTime;
      if (effectiveEnd <= effectiveStart) {
        throw new AppError('Thời gian kết thúc phải sau thời gian bắt đầu', 400);
      }
    }

    const updated = await eventRepository.update(id, input);

    await Promise.all([
      invalidateCache(`events:detail:${id}`),
      invalidateCache('events:list:*'),
    ]);

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

    // --- Fix lỗ hổng phát hiện được ---
    // Trước đây KHÔNG kiểm tra gì trước khi soft-delete - Event đã bán
    // vé vẫn "biến mất" khỏi GET /events/:id ngay lập tức (404), dù
    // khách đã thanh toán thật, vé vẫn nằm trong "orders". Áp dụng
    // ĐÚNG nguyên tắc đã dùng nhất quán cho TicketType/Category/Venue:
    // chặn xóa khi còn dữ liệu giao dịch phụ thuộc. Tổng hợp
    // soldQuantity từ MỌI TicketType của Event này - chỉ cần 1 loại vé
    // có người mua là đủ để chặn.
    const ticketTypes = await ticketTypeRepository.findByEventId(id);
    const totalSold = ticketTypes.reduce((sum, tt) => sum + tt.soldQuantity, 0);
    if (totalSold > 0) {
      throw new AppError(
        `Không thể xóa sự kiện đã có ${totalSold} vé được bán. Hãy chuyển trạng thái sang CANCELLED thay vì xóa, để giữ lại lịch sử giao dịch cho khách hàng.`,
        409,
      );
    }

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