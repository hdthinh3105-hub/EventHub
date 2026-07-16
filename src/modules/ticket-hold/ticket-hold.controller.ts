// src/modules/ticket-hold/ticket-hold.controller.ts
import { Request, Response } from 'express';
import { ticketHoldService } from './ticket-hold.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const ticketHoldController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const hold = await ticketHoldService.createHold(req.body, req.user!);
    res.status(201).json(ApiResponse.success(hold, 'Giữ chỗ thành công, vui lòng thanh toán trong 10 phút'));
  }),
};
