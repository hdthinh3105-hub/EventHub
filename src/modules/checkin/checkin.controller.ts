// src/modules/checkin/checkin.controller.ts
import { Request, Response } from 'express';
import { checkinService } from './checkin.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const checkinController = {
  checkin: asyncHandler(async (req: Request, res: Response) => {
    const result = await checkinService.checkin(req.body.qrCode, req.user!);
    res.status(200).json(ApiResponse.success(result, 'Check-in thành công'));
  }),
};
