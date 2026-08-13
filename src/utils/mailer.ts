// src/utils/mailer.ts
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Gửi mail qua Gmail REST API (HTTPS port 443) thay cho SMTP — vì Render
 * free tier chặn outbound SMTP 25/465/587 (từ 26/09/2025), gây lỗi
 * "Connection timeout" dù App Password đúng.
 *
 * Nếu đủ bộ OAuth (GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN) → dùng REST API.
 * Nếu thiếu → fallback về SMTP cũ (nodemailer) cho local dev.
 */

let accessToken: string | null = null;
let tokenExpiresAt = 0;
let smtpTransporter: nodemailer.Transporter | null = null;

function useGmailApi(): boolean {
  return Boolean(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN);
}

/** Mã hóa header chứa ký tự không-ASCII (VD tiếng Việt) theo RFC 2047. */
function encodeHeader(value: string): string {
  return /[\u0080-\uFFFF]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`
    : value;
}

/** Lấy access token (cache ~1h), tự refresh nếu hết hạn. */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (accessToken && now < tokenExpiresAt) {
    return accessToken;
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Không refresh được Gmail OAuth token (HTTP ${res.status}): ${body}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  accessToken = data.access_token;
  tokenExpiresAt = now + ((data.expires_in ?? 3600) - 60) * 1000;
  return accessToken;
}

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  plainText?: string;
  attachments?: { filename: string; content: Buffer; cid: string }[];
}

/** Điểm vào chung: ưu tiên REST API, fallback SMTP. */
async function sendMail(options: SendOptions): Promise<void> {
  if (useGmailApi()) {
    await sendViaGmailApi(options);
  } else {
    await sendViaSmtp(options);
  }
}

/** Gửi qua Gmail REST API: POST /gmail/v1/users/me/messages/send. */
async function sendViaGmailApi({ to, subject, html, plainText, attachments }: SendOptions): Promise<void> {
  const token = await getAccessToken();
  const mime = buildMimeMessage(to, subject, html, plainText, attachments);
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: Buffer.from(mime, 'utf-8').toString('base64url') }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API send thất bại (HTTP ${res.status}): ${body}`);
  }
  const result = (await res.json()) as { id?: string };
  logger.info(`[Mailer] Gmail API đã chấp nhận email id=${result.id} tới ${to}`);
}

/** Dựng email dạng RFC 2822 (MIME) — hỗ trợ HTML đơn / alternative / attachments. */
function buildMimeMessage(
  to: string,
  subject: string,
  html: string,
  plainText?: string,
  attachments?: { filename: string; content: Buffer; cid: string }[],
): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const hasAttachments = !!attachments && attachments.length > 0;
  const headers = [
    `From: "${encodeHeader('EventHub')}" <${env.GMAIL_USER}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
  ];

  if (!hasAttachments) {
    if (plainText) {
      return [
        ...headers,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(plainText, 'utf-8').toString('base64'),
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(html, 'utf-8').toString('base64'),
        `--${boundary}--`,
      ].join('\r\n');
    }
    return [
      ...headers,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(html, 'utf-8').toString('base64'),
    ].join('\r\n');
  }

  // multipart/related: phần alternative (text + html) + các attachment (QR PNG)
  const altBoundary = `${boundary}_alt`;
  const altParts: string[] = [];
  if (plainText) {
    altParts.push(
      `--${altBoundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(plainText, 'utf-8').toString('base64'),
    );
  }
  altParts.push(
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf-8').toString('base64'),
    `--${altBoundary}--`,
  );

  const relatedParts = [
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    altParts.join('\r\n'),
  ];
  for (const a of attachments!) {
    relatedParts.push(
      `--${boundary}`,
      `Content-Type: image/png; name="${a.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${a.cid}>`,
      '',
      a.content.toString('base64'),
    );
  }
  relatedParts.push(`--${boundary}--`);

  return [
    ...headers,
    `Content-Type: multipart/related; boundary="${boundary}"`,
    '',
    relatedParts.join('\r\n'),
  ].join('\r\n');
}

/** Fallback SMTP cũ (dùng khi chưa cấu hình OAuth — thường chỉ local dev). */
async function sendViaSmtp({ to, subject, html, plainText, attachments }: SendOptions): Promise<void> {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
    });
  }
  await smtpTransporter.sendMail({
    from: `"EventHub" <${env.GMAIL_USER}>`,
    to,
    subject,
    html,
    text: plainText,
    attachments: attachments?.map((a) => ({ filename: a.filename, content: a.content, cid: a.cid })),
  });
}

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
  const plainText = [
    'Vé của bạn đã sẵn sàng!',
    `Sự kiện: ${payload.eventTitle}`,
    `Loại vé: ${payload.ticketTypeName} x ${payload.quantity}`,
    `Tổng tiền: ${payload.totalAmount.toLocaleString('vi-VN')}đ`,
    'Mã vé:',
    ...payload.tickets.map((t, i) => `  ${i + 1}. ${t.qrCode}`),
    '',
    'Vui lòng xuất trình mã QR này tại cổng sự kiện để check-in.',
  ].join('\n');

  await sendMail({
    to: payload.to,
    subject: `Vé điện tử - ${payload.eventTitle}`,
    html,
    plainText,
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
  await sendMail({
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
  await sendMail({
    to,
    subject: 'Đặt lại mật khẩu EventHub',
    html,
  });
  logger.info(`[Mailer] Đã gửi email đặt lại mật khẩu tới ${to}`);
}
