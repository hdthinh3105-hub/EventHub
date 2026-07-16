// src/modules/event/event.repository.ts
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { CreateEventInput, UpdateEventInput, ListEventQuery } from './event.validation';

export const eventRepository = {
  async findMany(query: ListEventQuery) {
    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.status && { status: query.status }),
      ...(query.search && {
        title: { contains: query.search, mode: 'insensitive' },
      }),
    };

    const [items, total] = await Promise.all([
      prisma.event.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { startTime: 'asc' },
        include: {
          category: { select: { id: true, name: true } },
          venue: { select: { id: true, name: true, city: true } },
          organizer: { select: { id: true, fullName: true } },
        },
      }),
      prisma.event.count({ where }),
    ]);

    return { items, total };
  },

  findById(id: string) {
    return prisma.event.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        venue: true,
        organizer: { select: { id: true, fullName: true, email: true } },
        ticketTypes: true,
      },
    });
  },

  create(data: CreateEventInput & { organizerId: string }) {
    return prisma.event.create({
      data: data as unknown as Prisma.EventUncheckedCreateInput,
      include: { category: true, venue: true },
    });
  },

  update(id: string, data: UpdateEventInput) {
    return prisma.event.update({
      where: { id },
      data: data as Prisma.EventUpdateInput,
    });
  },

  updateCoverImage(id: string, coverImage: string) {
    return prisma.event.update({
      where: { id },
      data: { coverImage },
    });
  },

  // Soft delete - không xóa thật khỏi DB, chỉ đánh dấu deletedAt.
  // Lý do: Event đã bán vé thì KHÔNG được xóa cứng (mất luôn lịch sử
  // đơn hàng, vé đã phát hành) - đây là nguyên tắc chung cho mọi bảng
  // có liên quan tới giao dịch tài chính.
  softDelete(id: string) {
    return prisma.event.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },
};