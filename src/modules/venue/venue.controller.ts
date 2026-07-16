// src/modules/venue/venue.controller.ts
import { Request, Response } from 'express';
import { venueService } from './venue.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const venueController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const venues = await venueService.list();
    res.status(200).json(ApiResponse.success(venues));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const venue = await venueService.create(req.body);
    res.status(201).json(ApiResponse.success(venue, 'Tạo venue thành công'));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const venue = await venueService.update(req.params.id as string, req.body);
    res.status(200).json(ApiResponse.success(venue, 'Cập nhật thành công'));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await venueService.remove(req.params.id as string);
    res.status(200).json(ApiResponse.success(null, 'Xóa thành công'));
  }),
};
