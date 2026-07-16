// src/modules/venue/venue.repository.ts
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { CreateVenueInput, UpdateVenueInput } from './venue.validation';

export const venueRepository = {
  findAll() {
    return prisma.venue.findMany({ orderBy: { name: 'asc' } });
  },

  findById(id: string) {
    return prisma.venue.findUnique({ where: { id } });
  },

  create(data: CreateVenueInput) {
    return prisma.venue.create({ data: data as Prisma.VenueCreateInput });
  },

  update(id: string, data: UpdateVenueInput) {
    return prisma.venue.update({ where: { id }, data: data as Prisma.VenueUpdateInput });
  },

  delete(id: string) {
    return prisma.venue.delete({ where: { id } });
  },

  countEvents(id: string) {
    return prisma.event.count({ where: { venueId: id } });
  },
};
