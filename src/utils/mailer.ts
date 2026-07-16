// src/utils/mailer.ts
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { env } from '../config/env';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: env.GMAIL_USER,
    pass: env.GMAIL_APP_PASSWORD,
  },
});

export interface TicketEmailPayload {
  to: string;
  eventTitle: string;
  ticketTypeName: string;
  quantity: number;
  totalAmount: number;
  tickets: { id: string; qrCode: string }[];
}

export async function sendTicketEmail(payload: TicketEmailPayload): Promise<void> {
  // Sinh ảnh QR THẬT từ chuỗi mã (trước đây chỉ gửi chuỗi hex, không quét
  // được bằng máy/app thật). toBuffer() trả về ảnh PNG dạng Buffer, đính
  // kèm vào email qua "attachments" với "cid" (Content-ID) - đây là cách
  // chuẩn để nhúng ảnh TRỰC TIẾP vào nội dung HTML email (khác với đính
  // kèm file rời), hiển thị ngay trong email client mà không cần tải về.
  const attachments = await Promise.all(
    payload.tickets.map(async (t, i) => ({
      filename: `qr-${i + 1}.png`,
      content: await QRCode.toBuffer(t.qrCode, { width: 200 }),
      cid: `qr${i}`, // tham chiếu qua src="cid:qr0" trong HTML bên dưới
    })),
  );

  const ticketListHtml = payload.tickets
    .map(
      (t, i) => `
        <li style="margin-bottom: 16px;">
          Vé ${i + 1}: <b>${t.qrCode}</b><br/>
          <img src="cid:qr${i}" alt="QR code vé ${i + 1}" width="150" height="150" />
        </li>`,
    )
    .join('');

  const html = `
    <h2>Vé của bạn đã sẵn sàng!</h2>
    <p>Cảm ơn bạn đã đặt vé cho sự kiện <b>${payload.eventTitle}</b>.</p>
    <p>Loại vé: <b>${payload.ticketTypeName}</b> x ${payload.quantity}</p>
    <p>Tổng tiền: <b>${payload.totalAmount.toLocaleString('vi-VN')}đ</b></p>
    <ul style="list-style: none; padding: 0;">${ticketListHtml}</ul>
    <p>Vui lòng xuất trình mã QR này tại cổng sự kiện để check-in.</p>
  `;

  await transporter.sendMail({
    from: `"EventHub" <${env.GMAIL_USER}>`,
    to: payload.to,
    subject: `Vé điện tử - ${payload.eventTitle}`,
    html,
    attachments,
  });

  logger.info(`[Mailer] Đã gửi email vé (kèm ${attachments.length} ảnh QR) tới ${payload.to}`);
}

// --- Email xác thực tài khoản (Verify Email) ---
export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;
  const html = `
    <h2>Xác thực tài khoản EventHub</h2>
    <p>Vui lòng bấm nút bên dưới để xác thực email của bạn (liên kết có hiệu lực 24 giờ):</p>
    <p>
      <a href="${verifyUrl}"
         style="display: inline-block; padding: 12px 24px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">
        Xác thực ngay
      </a>
    </p>
    <p style="color: #666; font-size: 13px;">
      Nếu nút không hoạt động (VD: đang test qua Postman, chưa có Frontend triển khai),
      dùng trực tiếp mã sau với API <code>POST /api/auth/verify-email</code>:<br/>
      <code>${token}</code>
    </p>
  `;
  await transporter.sendMail({
    from: `"EventHub" <${env.GMAIL_USER}>`,
    to,
    subject: 'Xác thực tài khoản EventHub',
    html,
  });
  logger.info(`[Mailer] Đã gửi email xác thực tới ${to}`);
}

// --- Email quên mật khẩu (Forgot Password) ---
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  const html = `
    <h2>Đặt lại mật khẩu EventHub</h2>
    <p>Bấm nút bên dưới để đặt lại mật khẩu (liên kết có hiệu lực 15 phút):</p>
    <p>
      <a href="${resetUrl}"
         style="display: inline-block; padding: 12px 24px; background: #dc2626; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">
        Đặt lại mật khẩu
      </a>
    </p>
    <p style="color: #666; font-size: 13px;">
      Nếu nút không hoạt động (VD: đang test qua Postman, chưa có Frontend triển khai),
      dùng trực tiếp mã sau với API <code>POST /api/auth/reset-password</code>:<br/>
      <code>${token}</code>
    </p>
    <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
  `;
  await transporter.sendMail({
    from: `"EventHub" <${env.GMAIL_USER}>`,
    to,
    subject: 'Đặt lại mật khẩu EventHub',
    html,
  });
  logger.info(`[Mailer] Đã gửi email đặt lại mật khẩu tới ${to}`);
}