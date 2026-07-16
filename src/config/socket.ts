// src/config/socket.ts
//
// Socket.IO chạy CHUNG 1 cổng (port) với Express - gắn vào cùng 1
// http.Server (xem server.ts: http.createServer(app) rồi initSocket()
// nhận đúng server đó). Đây là lý do ta phải đổi từ app.listen() sang
// http.createServer(app) + httpServer.listen() ở Phase 11.
//
// Thiết kế phòng ("room"): mỗi Event có 1 room riêng, đặt tên
// "event:<eventId>". Client (Organizer/Admin) phải chủ động "join"
// đúng room của Event họ muốn theo dõi - đây là điểm khác REST API:
// WebSocket là kết nối bền, server cần biết "ai đang nghe cái gì" để
// gửi đúng dữ liệu, không gửi tràn lan cho mọi client.

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { logger } from '../utils/logger';

interface AuthenticatedSocket extends Socket {
  user?: JwtPayload;
}

let io: SocketIOServer | null = null;

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*', // đơn giản hóa cho demo - production nên siết đúng domain FE thật giống app.ts
    },
  });

  // Middleware xác thực NGAY LÚC HANDSHAKE (trước khi kết nối được chấp
  // nhận) - client phải gửi kèm accessToken, không cho kết nối "chui"
  // vào server rồi mới kiểm tra sau (tốn tài nguyên, dễ bị lạm dụng).
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Thiếu access token'));
    }
    try {
      socket.user = verifyAccessToken(token);
      next();
    } catch {
      next(new Error('Access token không hợp lệ hoặc đã hết hạn'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`[Socket.IO] Client kết nối: ${socket.id} (user: ${socket.user?.userId})`);

    // Client tự "join" vào room của Event họ muốn theo dõi - không kiểm
    // tra quyền sở hữu chặt tại đây (để đơn giản cho demo Phase 11) vì
    // đây chỉ là kênh ĐẨY THÔNG BÁO, không phải kênh trả dữ liệu nhạy
    // cảm - dữ liệu thật (doanh thu, danh sách khách) vẫn phải qua REST
    // API có đầy đủ Resource-based Authorization như các Phase trước.
    socket.on('join_event', (eventId: string) => {
      socket.join(`event:${eventId}`);
      logger.info(`[Socket.IO] ${socket.id} tham gia room event:${eventId}`);
    });

    socket.on('leave_event', (eventId: string) => {
      socket.leave(`event:${eventId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`[Socket.IO] Client ngắt kết nối: ${socket.id}`);
    });
  });

  logger.info('[Socket.IO] Đã khởi động');
  return io;
}

// getIO() dùng ở mọi nơi khác (VD order.service.ts) để emit sự kiện,
// không cần truyền io qua tham số khắp nơi trong code.
export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO chưa được khởi tạo - gọi initSocket() trước');
  }
  return io;
}
