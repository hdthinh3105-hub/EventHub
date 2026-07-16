// src/modules/category/category.controller.ts
import { Request, Response } from 'express';
import { categoryService } from './category.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const categoryController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const categories = await categoryService.list();
    res.status(200).json(ApiResponse.success(categories));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const category = await categoryService.create(req.body);
    res.status(201).json(ApiResponse.success(category, 'Tạo category thành công'));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const category = await categoryService.update(req.params.id as string, req.body);
    res.status(200).json(ApiResponse.success(category, 'Cập nhật thành công'));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await categoryService.remove(req.params.id as string);
    res.status(200).json(ApiResponse.success(null, 'Xóa thành công'));
  }),
};
