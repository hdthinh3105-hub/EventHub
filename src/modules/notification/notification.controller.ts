// src/modules/notification/notification.controller.ts
import { Request, Response } from 'express';
import { notificationService } from './notification.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const notificationController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const notifications = await notificationService.list(req.user!);
    res.status(200).json(ApiResponse.success(notifications));
  }),

  markRead: asyncHandler(async (req: Request, res: Response) => {
    const notification = await notificationService.markRead(req.params.id as string, req.user!);
    res.status(200).json(ApiResponse.success(notification, 'Đã đánh dấu đọc'));
  }),
};
