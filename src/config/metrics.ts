// src/config/metrics.ts
//
// prom-client tự động sinh format text mà Prometheus server hiểu được
// (khác hẳn JSON API thông thường - đây là 1 "ngôn ngữ" riêng của hệ
// sinh thái Prometheus, gọi là "exposition format").
//
// 2 NHÓM metrics ta expose:
// 1. Default metrics (registry.setDefaultMetrics) - tự động có sẵn:
//    CPU usage, memory (heap), event loop lag, số file descriptor đang
//    mở... - không cần code gì thêm, prom-client tự thu thập định kỳ.
// 2. Custom metrics (tự định nghĩa) - đo đúng những gì ĐẶC THÙ với
//    EventHub mà không công cụ chung nào biết đo hộ bạn: bao nhiêu vé
//    đã bán, bao nhiêu lần giữ chỗ thất bại vì hết vé (đây mới là thứ
//    Organizer/DevOps thật sự quan tâm, không chỉ "server có sống không").

import client from 'prom-client';

// Registry: nơi TẤT CẢ metrics đăng ký vào - endpoint /metrics sẽ đọc
// từ registry này để trả về toàn bộ dữ liệu cùng lúc.
export const register = new client.Registry();

// Gắn nhãn mặc định (VD tên service) vào MỌI metric - hữu ích khi bạn
// gom nhiều service khác nhau vào chung 1 Prometheus/Grafana sau này.
register.setDefaultLabels({ app: 'eventhub-backend' });

// Bật thu thập default metrics (CPU, memory, event loop lag...) - đây
// gần như luôn nên bật cho MỌI service Node.js, không riêng gì EventHub.
client.collectDefaultMetrics({ register });

// --- Custom metric 1: thời gian phản hồi mỗi request ---
// Histogram (không phải Gauge/Counter đơn thuần) vì ta cần biết PHÂN
// BỐ độ trễ (VD "95% request dưới 200ms" là câu hỏi thật khi vận hành),
// không chỉ 1 con số trung bình dễ gây hiểu lầm (trung bình có thể thấp
// dù có vài request rất chậm làm hỏng trải nghiệm 1 nhóm nhỏ user).
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Thời gian xử lý request HTTP (giây)',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5], // các "ngưỡng" để phân bố vào - tinh chỉnh theo đặc thù API (đa số nên xong dưới 0.5s)
  registers: [register],
});

// --- Custom metric 2 (business): tổng số vé đã bán thành công ---
// Counter: chỉ tăng, không bao giờ giảm - đúng bản chất "tổng số vé đã
// bán từ trước tới giờ". Khác Histogram/Gauge ở chỗ Counter chỉ trả
// lời được "tổng cộng bao nhiêu", Grafana sẽ tự tính "tốc độ tăng" (vé/phút)
// qua hàm rate() - không cần bạn tự tính tốc độ trong code.
export const ticketsSoldCounter = new client.Counter({
  name: 'eventhub_tickets_sold_total',
  help: 'Tổng số vé đã bán thành công (qua checkout, không tính vé mời)',
  registers: [register],
});

// --- Custom metric 3 (business): số lần giữ chỗ thất bại do hết vé ---
// Đây chính là con số "sức khỏe nghiệp vụ" quan trọng nhất của Phase 7 -
// nếu số này tăng đột biến, đó là dấu hiệu 1 sự kiện đang "hot" (nhiều
// người tranh mua) HOẶC dấu hiệu lỗi thật (Organizer set totalQuantity
// sai). Đây đúng là loại metric mà 1 buổi phỏng vấn sẽ khen "bạn hiểu
// rõ observability, không chỉ dừng ở CPU/RAM".
export const holdRejectedCounter = new client.Counter({
  name: 'eventhub_hold_rejected_total',
  help: 'Tổng số lần giữ chỗ bị từ chối do hết vé hoặc tranh chấp quá cao',
  labelNames: ['reason'], // "out_of_stock" | "contention" (hết lượt retry)
  registers: [register],
});
