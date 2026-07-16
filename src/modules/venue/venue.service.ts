// src/modules/venue/venue.service.ts
import { venueRepository } from './venue.repository';
import { AppError } from '../../utils/apiResponse';
import { CreateVenueInput, UpdateVenueInput } from './venue.validation';
import { getOrSetCache, invalidateCache } from '../../utils/cache';

const CACHE_TTL = 300;
const CACHE_KEY = 'venues:list';

export const venueService = {
  list() {
    return getOrSetCache(CACHE_KEY, CACHE_TTL, () => venueRepository.findAll());
  },

  async create(input: CreateVenueInput) {
    const venue = await venueRepository.create(input);
    await invalidateCache(CACHE_KEY);
    return venue;
  },

  async update(id: string, input: UpdateVenueInput) {
    const venue = await venueRepository.findById(id);
    if (!venue) {
      throw new AppError('Không tìm thấy venue', 404);
    }
    const updated = await venueRepository.update(id, input);
    await invalidateCache(CACHE_KEY);
    return updated;
  },

  async remove(id: string) {
    const venue = await venueRepository.findById(id);
    if (!venue) {
      throw new AppError('Không tìm thấy venue', 404);
    }
    const eventCount = await venueRepository.countEvents(id);
    if (eventCount > 0) {
      throw new AppError(`Không thể xóa: đang có ${eventCount} sự kiện tổ chức tại venue này`, 409);
    }
    const result = await venueRepository.delete(id);
    await invalidateCache(CACHE_KEY);
    return result;
  },
};