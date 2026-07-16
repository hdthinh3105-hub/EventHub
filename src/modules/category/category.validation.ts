// src/modules/category/category.validation.ts
import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(2, 'Tên category tối thiểu 2 ký tự').max(50),
});

export const updateCategorySchema = createCategorySchema.partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
