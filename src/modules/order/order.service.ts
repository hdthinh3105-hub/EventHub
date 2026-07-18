// src/modules/order/order.service.ts
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import { orderRepository } from './order.repository';
import { eventRepository } from '../event/event.repository';
import { userRepository } from '../user/user.repository';
import { authRepository } from '../auth/auth.repository';
import { ticketTypeRepository } from '../ticket-type/ticket-type.repository';
import { assertCanModifyEvent } from '../event/event.service';
import { AppError } from '../../utils/apiResponse';
import { CheckoutInput } from './order.validation';
import { JwtPayload } from '../../utils/jwt';
import { publishTicketEmail } from '../../queues/email.queue';
import { getIO } from '../../config/socket';
import { notificationRepository } from '../notification/notification.repository';
import { logger } from '../../utils/logger';

// Helper đọc giá trị 1 cell Excel ra CHUỖI THUẦN, xử lý đúng các trường
// hợp ExcelJS trả về OBJECT thay vì string thuần.
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((rt) => rt.text).join('').trim();
    }
    if ('text' in value) {
      return String(value.text).trim();
    }
    if ('result' in value) {
      return String(value.result).trim();
    }
  }
  return String(value).trim();
}

export const orderService = {
  async checkout(input: CheckoutInput, user: JwtPayload) {
    const hold = await orderRepository.findHoldById(input.holdId);
    if (!hold) {
      throw new AppError('Không tìm thấy phiên giữ chỗ', 404);
    }

    // Chỉ chính chủ hold mới được checkout - tránh user A thanh toán
    // hộ (hoặc phá) hold của user B nếu lỡ đoán được holdId.
    if (hold.userId !== user.userId) {
      throw new AppError('Bạn không có quyền thanh toán phiên giữ chỗ này', 403);
    }

    // Hold đã hết hạn - dù job dọn dẹp (Phase 7.4) có thể chưa kịp xóa,
    // ta VẪN PHẢI tự kiểm tra expiresAt ở đây - không được tin tưởng
    // "hold còn tồn tại trong DB" đồng nghĩa "còn hiệu lực".
    if (hold.expiresAt < new Date()) {
      throw new AppError('Phiên giữ chỗ đã hết hạn, vui lòng giữ chỗ lại', 410);
    }

    // --- Fix lỗ hổng phát hiện được: fetch Event NGAY TỪ ĐẦU (trước
    // khi chạy transaction checkout), không phải sau như bản trước. ---
    // Tình huống thật: khách giữ chỗ lúc Event còn PUBLISHED, nhưng
    // TRONG 10 phút giữ chỗ, Organizer lỡ hủy Event (status ->
    // CANCELLED). Nếu không kiểm tra lại tại đây, khách vẫn thanh toán
    // thành công, hệ thống vẫn phát hành vé + trừ soldQuantity cho 1
    // sự kiện ĐÃ BỊ HỦY - vé phát ra vô nghĩa, dữ liệu doanh thu sai.
    const event = await eventRepository.findById(hold.ticketType.eventId);
    if (!event) {
      throw new AppError('Không tìm thấy sự kiện', 404);
    }
    if (event.status === 'CANCELLED' || event.status === 'COMPLETED') {
      throw new AppError('Sự kiện đã bị hủy hoặc đã kết thúc, không thể thanh toán', 409);
    }

    const { order, tickets } = await orderRepository.checkout({
      holdId: hold.id,
      ticketTypeId: hold.ticketTypeId,
      userId: user.userId,
      quantity: hold.quantity,
      unitPrice: Number(hold.ticketType.price),
    });

    // Đẩy việc gửi email vào queue - KHÔNG "await" chờ email gửi xong,
    // chỉ đẩy message rồi đi tiếp. Lấy thêm thông tin user cần cho nội
    // dung email (event đã có sẵn từ bước kiểm tra phía trên, không
    // cần query lại lần nữa).
    const fullUser = await userRepository.findById(user.userId);

    if (fullUser) {
      publishTicketEmail({
        to: fullUser.email,
        eventTitle: event.title,
        ticketTypeName: hold.ticketType.name,
        quantity: hold.quantity,
        totalAmount: Number(order.totalAmount),
        tickets: tickets.map((t) => ({ id: t.id, qrCode: t.qrCode })),
      });

      // --- Realtime: báo cho Organizer đang xem dashboard biết ngay ---
      const newSoldQuantity = hold.ticketType.soldQuantity + hold.quantity;

      try {
        getIO().to(`event:${event.id}`).emit('ticket_sold', {
          ticketTypeId: hold.ticketTypeId,
          ticketTypeName: hold.ticketType.name,
          quantitySold: hold.quantity,
          newSoldQuantity,
          totalQuantity: hold.ticketType.totalQuantity,
        });
      } catch (err) {
        logger.error(`[Socket.IO] Lỗi emit ticket_sold: ${err}`);
      }

      await notificationRepository.create({
        userId: event.organizerId,
        title: 'Có vé mới được bán',
        message: `${hold.quantity} vé loại "${hold.ticketType.name}" vừa được bán cho sự kiện "${event.title}"`,
      });
    }

    return { order, tickets };
  },

  // --- EXPORT: xuất báo cáo doanh thu 1 Event ra file Excel ---
  async exportEventRevenue(eventId: string, user: JwtPayload): Promise<Buffer> {
    const event = await eventRepository.findById(eventId);
    if (!event) {
      throw new AppError('Không tìm thấy sự kiện', 404);
    }
    assertCanModifyEvent(event, user);

    const orderItems = await orderRepository.findOrderItemsByEventId(eventId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Doanh thu');

    sheet.columns = [
      { header: 'Mã đơn hàng', key: 'orderId', width: 38 },
      { header: 'Khách hàng', key: 'customerName', width: 24 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Loại vé', key: 'ticketType', width: 20 },
      { header: 'Số lượng', key: 'quantity', width: 10 },
      { header: 'Đơn giá', key: 'unitPrice', width: 14 },
      { header: 'Thành tiền', key: 'total', width: 14 },
      { header: 'Ngày mua', key: 'createdAt', width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };

    let totalRevenue = 0;
    for (const item of orderItems) {
      const lineTotal = Number(item.unitPrice) * item.quantity;
      totalRevenue += lineTotal;
      sheet.addRow({
        orderId: item.order.id,
        customerName: item.order.user.fullName,
        email: item.order.user.email,
        ticketType: item.ticketType.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        total: lineTotal,
        createdAt: item.order.createdAt.toLocaleString('vi-VN'),
      });
    }

    sheet.addRow({});
    const summaryRow = sheet.addRow({ ticketType: 'TỔNG DOANH THU', total: totalRevenue });
    summaryRow.font = { bold: true };

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  },

  // --- IMPORT: nhập danh sách vé mời hàng loạt từ file Excel ---
  async importGuestList(
    ticketTypeId: string,
    fileBuffer: Buffer,
    user: JwtPayload,
  ): Promise<{ importedGuests: number; totalTickets: number }> {
    const ticketType = await ticketTypeRepository.findById(ticketTypeId);
    if (!ticketType) {
      throw new AppError('Không tìm thấy loại vé', 404);
    }

    const event = await eventRepository.findById(ticketType.eventId);
    if (!event) {
      throw new AppError('Không tìm thấy sự kiện', 404);
    }
    assertCanModifyEvent(event, user);

    // Fix lỗ hổng phát hiện được (cùng nhóm với TicketType CRUD) -
    // không cho nhập vé mời cho sự kiện đã hủy/đã kết thúc.
    if (event.status === 'CANCELLED' || event.status === 'COMPLETED') {
      throw new AppError('Không thể nhập vé mời cho sự kiện đã hủy hoặc đã kết thúc', 409);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new AppError('File Excel không có sheet nào', 400);
    }

    const rows: { fullName: string; email: string; quantity: number }[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const fullName = cellToString(row.getCell(1).value);
      const email = cellToString(row.getCell(2).value);
      const quantity = Number(row.getCell(3).value ?? 1);

      if (!fullName || !email) return;
      rows.push({ fullName, email, quantity: quantity > 0 ? quantity : 1 });
    });

    if (rows.length === 0) {
      throw new AppError('Không tìm thấy dữ liệu hợp lệ trong file Excel', 400);
    }

    const totalRequested = rows.reduce((sum, r) => sum + r.quantity, 0);
    const available = ticketType.totalQuantity - ticketType.soldQuantity;
    if (totalRequested > available) {
      throw new AppError(
        `Chỉ còn ${available} vé, không đủ để nhập ${totalRequested} vé mời`,
        409,
      );
    }

    const guestRole = await authRepository.findRoleByName('CUSTOMER');
    if (!guestRole) {
      throw new AppError('Hệ thống chưa sẵn sàng (thiếu role CUSTOMER)', 500);
    }

    const guests: { userId: string; quantity: number }[] = [];
    for (const row of rows) {
      let existingUser = await authRepository.findUserByEmail(row.email);
      if (!existingUser) {
        const randomPassword = crypto.randomBytes(16).toString('hex');
        const passwordHash = await bcrypt.hash(randomPassword, 10);
        existingUser = await authRepository.createUser({
          email: row.email,
          fullName: row.fullName,
          passwordHash,
          roleId: guestRole.id,
        });
      }
      guests.push({ userId: existingUser.id, quantity: row.quantity });
    }

    const results = await orderRepository.bulkImportGuestTickets(ticketTypeId, guests);

    results.forEach((result, index) => {
      const row = rows[index];
      if (!row) return;
      publishTicketEmail({
        to: row.email,
        eventTitle: event.title,
        ticketTypeName: ticketType.name,
        quantity: row.quantity,
        totalAmount: 0,
        tickets: result.tickets.map((t) => ({ id: t.id, qrCode: t.qrCode })),
      });
    });

    return { importedGuests: guests.length, totalTickets: totalRequested };
  },
};