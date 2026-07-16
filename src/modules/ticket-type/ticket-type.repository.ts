// src/modules/ticket-type/ticket-type.repository.ts
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { CreateTicketTypeInput, UpdateTicketTypeInput } from './ticket-type.validation';

export const ticketTypeRepository = {
  findByEventId(eventId: string) {
    return prisma.ticketType.findMany({
      where: { eventId },
      orderBy: { price: 'asc' },
    });
  },

  findById(id: string) {
    return prisma.ticketType.findUnique({ where: { id } });
  },

  create(eventId: string, data: CreateTicketTypeInput) {
    return prisma.ticketType.create({
      data: { ...data, eventId } as Prisma.TicketTypeUncheckedCreateInput,
    });
  },

  update(id: string, data: UpdateTicketTypeInput) {
    return prisma.ticketType.update({
      where: { id },
      data: data as Prisma.TicketTypeUpdateInput,
    });
  },

  delete(id: string) {
    return prisma.ticketType.delete({ where: { id } });
  },
};
