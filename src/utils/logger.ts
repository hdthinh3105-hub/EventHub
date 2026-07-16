// src/utils/logger.ts
//
// Tại sao không dùng console.log cho cả project?
// 1. Không có level (info/warn/error) -> khó lọc log quan trọng giữa
//    hàng nghìn dòng log khi debug production.
// 2. Không ghi ra file -> log mất hết khi container restart, trong khi
//    audit/debug production cần lịch sử log tồn tại lâu dài.
// 3. Không có format nhất quán (timestamp, service name) -> khó tích
//    hợp với hệ thống log tập trung (VD: Grafana Loki, ELK stack) sau này.

import winston from 'winston';
import { env } from '../config/env';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}]: ${stack || message}`;
});

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }), // giữ nguyên stack trace khi log Error object
    logFormat,
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
    }),
    // Log ra file chỉ bật ở production - dev không cần, tránh rác thư mục
    ...(env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
});
