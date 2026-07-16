// src/modules/event/event.controller.ts
import { Request, Response } from 'express';
import { eventService } from './event.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { ListEventQuery } from './event.validation';

export const eventController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as unknown as ListEventQuery;
    const { items, meta } = await eventService.list(query);
    res.status(200).json(ApiResponse.paginated(items, meta));
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const event = await eventService.getById(req.params.id as string);
    res.status(200).json(ApiResponse.success(event));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    // req.user chắc chắn tồn tại vì route đã qua authMiddleware trước đó
    const event = await eventService.create(req.body, req.user!);
    res.status(201).json(ApiResponse.success(event, 'Tạo sự kiện thành công'));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const event = await eventService.update(req.params.id as string, req.body, req.user!);
    res.status(200).json(ApiResponse.success(event, 'Cập nhật thành công'));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await eventService.remove(req.params.id as string, req.user!);
    res.status(200).json(ApiResponse.success(null, 'Xóa sự kiện thành công'));
  }),

  uploadImage: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'Vui lòng chọn file ảnh' });
      return;
    }
    const event = await eventService.uploadCoverImage(
      req.params.id as string,
      req.file.buffer,
      req.user!,
    );
    res.status(200).json(ApiResponse.success(event, 'Tải ảnh bìa thành công'));
  }),
};