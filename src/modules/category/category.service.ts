// src/modules/category/category.service.ts
import { categoryRepository } from './category.repository';
import { AppError } from '../../utils/apiResponse';
import { CreateCategoryInput, UpdateCategoryInput } from './category.validation';
import { getOrSetCache, invalidateCache } from '../../utils/cache';

// TTL dài hơn Event (300s so với 60s) vì Category gần như không đổi -
// chỉ Admin mới sửa được, tần suất ghi cực thấp so với tần suất đọc.
const CACHE_TTL = 300;
const CACHE_KEY = 'categories:list'; // list() không có tham số filter nào
                                       // -> chỉ cần đúng 1 cache key cố định,
                                       // đơn giản hơn nhiều so với Event.

export const categoryService = {
  list() {
    return getOrSetCache(CACHE_KEY, CACHE_TTL, () => categoryRepository.findAll());
  },

  async create(input: CreateCategoryInput) {
    const existing = await categoryRepository.findByName(input.name);
    if (existing) {
      throw new AppError('Category đã tồn tại', 409);
    }
    const category = await categoryRepository.create(input);
    await invalidateCache(CACHE_KEY);
    return category;
  },

  async update(id: string, input: UpdateCategoryInput) {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw new AppError('Không tìm thấy category', 404);
    }
    if (input.name) {
      const existing = await categoryRepository.findByName(input.name);
      if (existing && existing.id !== id) {
        throw new AppError('Tên category đã được sử dụng', 409);
      }
    }
    const updated = await categoryRepository.update(id, input);
    await invalidateCache(CACHE_KEY);
    return updated;
  },

  async remove(id: string) {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw new AppError('Không tìm thấy category', 404);
    }
    const eventCount = await categoryRepository.countEvents(id);
    if (eventCount > 0) {
      throw new AppError(
        `Không thể xóa: đang có ${eventCount} sự kiện thuộc category này`,
        409,
      );
    }
    const result = await categoryRepository.delete(id);
    await invalidateCache(CACHE_KEY);
    return result;
  },
};