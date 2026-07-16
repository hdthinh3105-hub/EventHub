// src/modules/ticket-type/ticket-type.controller.ts
import { Request, Response } from 'express';
import { ticketTypeService } from './ticket-type.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const ticketTypeController = {
  listByEvent: asyncHandler(async (req: Request, res: Response) => {
    const ticketTypes = await ticketTypeService.listByEvent(req.params.eventId as string);
    res.status(200).json(ApiResponse.success(ticketTypes));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const ticketType = await ticketTypeService.create(
      req.params.eventId as string,
      req.body,
      req.user!,
    );
    res.status(201).json(ApiResponse.success(ticketType, 'Tạo loại vé thành công'));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const ticketType = await ticketTypeService.update(req.params.id as string, req.body, req.user!);
    res.status(200).json(ApiResponse.success(ticketType, 'Cập nhật thành công'));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await ticketTypeService.remove(req.params.id as string, req.user!);
    res.status(200).json(ApiResponse.success(null, 'Xóa loại vé thành công'));
  }),
};
