// src/modules/event-staff/event-staff.controller.ts
import { Request, Response } from 'express';
import { eventStaffService } from './event-staff.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const eventStaffController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const staff = await eventStaffService.list(req.params.eventId as string, req.user!);
    res.status(200).json(ApiResponse.success(staff));
  }),

  assign: asyncHandler(async (req: Request, res: Response) => {
    const result = await eventStaffService.assign(
      req.params.eventId as string,
      req.body.userId,
      req.user!,
    );
    res.status(201).json(ApiResponse.success(result, 'Gán Staff thành công'));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await eventStaffService.remove(
      req.params.eventId as string,
      req.params.userId as string,
      req.user!,
    );
    res.status(200).json(ApiResponse.success(null, 'Bỏ gán Staff thành công'));
  }),
};
