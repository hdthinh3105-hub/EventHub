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
// hợp ExcelJS trả về OBJECT thay vì string thuần - lỗi rất hay gặp và
// dễ bị bỏ sót: khi Excel/WPS tự động format 1 ô thành hyperlink (phổ
// biến với email, URL), giá trị cell không còn là string mà là
// { text, hyperlink }. Gọi String(cellValue) trực tiếp trên object này
// sẽ luôn ra "[object Object]" - một lỗi ÂM THẦM, không throw exception
// nên rất dễ lọt qua test nếu không kiểm tra kỹ dữ liệu thực tế.
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

    const { order, tickets } = await orderRepository.checkout({
      holdId: hold.id,
      ticketTypeId: hold.ticketTypeId,
      userId: user.userId,
      quantity: hold.quantity,
      unitPrice: Number(hold.ticketType.price),
    });

    // Đẩy việc gửi email vào queue - KHÔNG "await" chờ email gửi xong,
    // chỉ đẩy message rồi đi tiếp. Đây chính là điểm khiến API trả
    // response NGAY LẬP TỨC cho user, đúng mục tiêu đặt ra ở Phase 9.1.
    // Lấy thêm thông tin event/user CẦN cho nội dung email - không có
    // sẵn trong kết quả checkout() vì Repository chỉ trả đúng dữ liệu
    // giao dịch (Order/Ticket), không kèm thông tin hiển thị.
    const [event, fullUser] = await Promise.all([
      eventRepository.findById(hold.ticketType.eventId),
      userRepository.findById(user.userId),
    ]);

    if (event && fullUser) {
      publishTicketEmail({
        to: fullUser.email,
        eventTitle: event.title,
        ticketTypeName: hold.ticketType.name,
        quantity: hold.quantity,
        totalAmount: Number(order.totalAmount),
        tickets: tickets.map((t) => ({ id: t.id, qrCode: t.qrCode })),
      });

      // --- Realtime: báo cho Organizer đang xem dashboard biết ngay ---
      // newSoldQuantity tính TỪ GIÁ TRỊ ĐÃ ĐỌC TRƯỚC KHI checkout() tăng
      // (hold.ticketType.soldQuantity) + số vé vừa bán - không cần query
      // lại DB, tránh tốn thêm round-trip chỉ để lấy 1 con số có thể tự
      // tính được từ dữ liệu đã có sẵn trong scope.
      const newSoldQuantity = hold.ticketType.soldQuantity + hold.quantity;

      // socket.io "try-catch" ngầm: nếu getIO() throw (Socket.IO chưa
      // init - không nên xảy ra vì server.ts luôn initSocket() trước khi
      // nhận request), KHÔNG được làm hỏng luồng checkout đã thành công.
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

      // Ghi lại Notification THẬT vào DB (không chỉ emit "ảo" qua socket)
      // - để Organizer vẫn xem lại được lịch sử thông báo dù lúc bán vé
      // họ không đang mở dashboard (không kết nối Socket.IO tại thời điểm đó).
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
    // Cùng cơ chế Resource-based Authorization - chỉ chủ Event (hoặc
    // Admin) mới xem được báo cáo doanh thu của chính sự kiện đó.
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
    sheet.getRow(1).font = { bold: true }; // in đậm dòng tiêu đề cho dễ đọc

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

    // Dòng trống + dòng tổng kết ở cuối file
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

    // --- Đọc file Excel từ buffer ---
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new AppError('File Excel không có sheet nào', 400);
    }

    // Quy ước cột: A=Họ tên, B=Email, C=Số lượng - dòng 1 là header, bỏ qua
    const rows: { fullName: string; email: string; quantity: number }[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // bỏ header
      const fullName = cellToString(row.getCell(1).value);
      const email = cellToString(row.getCell(2).value);
      const quantity = Number(row.getCell(3).value ?? 1);

      if (!fullName || !email) return; // bỏ qua dòng trống
      rows.push({ fullName, email, quantity: quantity > 0 ? quantity : 1 });
    });

    if (rows.length === 0) {
      throw new AppError('Không tìm thấy dữ liệu hợp lệ trong file Excel', 400);
    }

    // --- Kiểm tra sức chứa TRƯỚC KHI tạo bất kỳ dữ liệu nào ---
    // Đây là "kiểm tra trước, ghi sau" đơn giản (không cần Optimistic
    // Locking như Phase 7) - vì import là thao tác NỘI BỘ do Admin/
    // Organizer chủ động thực hiện 1 lần, không phải hàng nghìn user
    // công khai tranh chấp đồng thời như luồng đặt vé công khai.
    const totalRequested = rows.reduce((sum, r) => sum + r.quantity, 0);
    const available = ticketType.totalQuantity - ticketType.soldQuantity;
    if (totalRequested > available) {
      throw new AppError(
        `Chỉ còn ${available} vé, không đủ để nhập ${totalRequested} vé mời`,
        409,
      );
    }

    // --- Tìm hoặc tạo User cho từng email trong file ---
    const guestRole = await authRepository.findRoleByName('CUSTOMER');
    if (!guestRole) {
      throw new AppError('Hệ thống chưa sẵn sàng (thiếu role CUSTOMER)', 500);
    }

    const guests: { userId: string; quantity: number }[] = [];
    for (const row of rows) {
      let existingUser = await authRepository.findUserByEmail(row.email);
      if (!existingUser) {
        // Khách mời chưa có tài khoản - tạo mới với mật khẩu ngẫu nhiên.
        // Họ KHÔNG CẦN mật khẩu này để nhận vé - vé (kèm QR code) được
        // gửi thẳng qua email ngay bên dưới, giống hệt cách hệ thống vé
        // thật hoạt động (Ticketbox, Eventbrite): email chính là bằng
        // chứng sở hữu vé, không bắt buộc phải đăng nhập mới xem được.
        // Nếu sau này khách muốn đăng nhập xem lịch sử vé, họ dùng chức
        // năng "Quên mật khẩu" để tự đặt mật khẩu mới.
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

    // Gửi email vé cho TỪNG khách mời - "results" và "rows" cùng thứ tự
    // (1-1 tương ứng theo đúng vòng lặp đã xử lý ở trên), nên zip theo
    // index là an toàn để lấy đúng email/tên của từng người.
    results.forEach((result, index) => {
      const row = rows[index];
      if (!row) return;
      publishTicketEmail({
        to: row.email,
        eventTitle: event.title,
        ticketTypeName: ticketType.name,
        quantity: row.quantity,
        totalAmount: 0, // vé mời - miễn phí
        tickets: result.tickets.map((t) => ({ id: t.id, qrCode: t.qrCode })),
      });
    });

    return { importedGuests: guests.length, totalTickets: totalRequested };
  },
};