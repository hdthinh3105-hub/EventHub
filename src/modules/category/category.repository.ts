// src/modules/category/category.repository.ts
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { CreateCategoryInput, UpdateCategoryInput } from './category.validation';

export const categoryRepository = {
  findAll() {
    return prisma.category.findMany({ orderBy: { name: 'asc' } });
  },

  findById(id: string) {
    return prisma.category.findUnique({ where: { id } });
  },

  findByName(name: string) {
    return prisma.category.findUnique({ where: { name } });
  },

  create(data: CreateCategoryInput) {
    return prisma.category.create({ data });
  },

  update(id: string, data: UpdateCategoryInput) {
    return prisma.category.update({ where: { id }, data: data as Prisma.CategoryUpdateInput });
  },

  delete(id: string) {
    return prisma.category.delete({ where: { id } });
  },

  // Đếm số Event đang dùng category này - cần thiết trước khi xóa
  countEvents(id: string) {
    return prisma.event.count({ where: { categoryId: id } });
  },
};
