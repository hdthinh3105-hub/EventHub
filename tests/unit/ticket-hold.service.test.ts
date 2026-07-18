// tests/unit/ticket-hold.service.test.ts
//
// Đây là bài test QUAN TRỌNG NHẤT trong toàn bộ project - kiểm chứng
// đúng thuật toán Optimistic Locking (Phase 7) mà không cần chạm vào
// DB/autocannon thật. Bằng cách "mock" Repository (giả lập kết quả trả
// về), ta ép được server rơi vào ĐÚNG kịch bản race condition mong
// muốn - việc mà chạy autocannon thật rất khó kiểm soát chính xác
// (phụ thuộc timing thật, không lặp lại y hệt được giữa các lần chạy).
//
// jest.mock() thay thế TOÀN BỘ module bằng phiên bản giả - khi
// ticket-hold.service.ts gọi ticketTypeRepository.findById(...), nó
// KHÔNG chạm Prisma/Postgres thật, mà gọi vào mock ta tự định nghĩa.
//
// CẬP NHẬT (fix lỗ hổng "giữ chỗ cho Event chưa PUBLISHED/đã qua giờ"):
// ticket-hold.service.ts giờ gọi THÊM eventRepository.findById() ngay
// đầu hàm createHold() để kiểm tra event.status === 'PUBLISHED' và
// event.startTime còn ở tương lai, TRƯỚC KHI vào vòng lặp CAS. Nếu
// không mock eventRepository, lời gọi này sẽ rơi xuống Prisma thật và
// cố kết nối DB thật (localhost:5432) - đúng nguyên nhân toàn bộ test
// suite này fail trên CI (không có Postgres nào chạy ở đó). Thêm
// eventRepository vào danh sách module bị mock, và cho nó trả về 1
// Event giả hợp lệ (PUBLISHED, startTime trong tương lai) ở mọi test
// happy-path/retry - đây không phải điều đang được kiểm chứng ở các
// test này (đã có unit test riêng nếu cần cho nhánh Event bị chặn),
// nên chỉ cần "cho qua" bước kiểm tra đó là đủ.

import { ticketHoldService } from '../../src/modules/ticket-hold/ticket-hold.service';
import { ticketTypeRepository } from '../../src/modules/ticket-type/ticket-type.repository';
import { ticketHoldRepository } from '../../src/modules/ticket-hold/ticket-hold.repository';
import { eventRepository } from '../../src/modules/event/event.repository';
import { AppError } from '../../src/utils/apiResponse';
import { JwtPayload } from '../../src/utils/jwt';

jest.mock('../../src/modules/ticket-type/ticket-type.repository');
jest.mock('../../src/modules/ticket-hold/ticket-hold.repository');
jest.mock('../../src/modules/event/event.repository');

const mockedTicketTypeRepo = ticketTypeRepository as jest.Mocked<typeof ticketTypeRepository>;
const mockedHoldRepo = ticketHoldRepository as jest.Mocked<typeof ticketHoldRepository>;
const mockedEventRepo = eventRepository as jest.Mocked<typeof eventRepository>;

const fakeUser: JwtPayload = { userId: 'user-1', roleId: 'role-1', roleName: 'CUSTOMER' };

// Dữ liệu TicketType giả lập - còn 5 vé (total 10, đã bán 5), version 0
function buildTicketType(overrides: Partial<{ totalQuantity: number; soldQuantity: number; version: number }> = {}) {
  return {
    id: 'ticket-type-1',
    eventId: 'event-1',
    name: 'Standard',
    price: 100_000 as unknown as never, // Decimal type của Prisma - không dùng trong logic test này
    totalQuantity: overrides.totalQuantity ?? 10,
    soldQuantity: overrides.soldQuantity ?? 5,
    version: overrides.version ?? 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Event giả lập HỢP LỆ (PUBLISHED, còn diễn ra trong tương lai) - dùng
// làm mặc định cho mọi test không nhắm tới việc kiểm tra riêng Event.
// Chỉ cần đúng 2 field mà ticket-hold.service.ts thực sự đọc tới
// (status, startTime) - các field khác không quan trọng với test này.
function buildPublishedEvent() {
  return {
    id: 'event-1',
    status: 'PUBLISHED' as const,
    startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 ngày nữa
  };
}

describe('ticketHoldService.createHold - Optimistic Locking', () => {
  beforeEach(() => {
    // Mặc định mọi test đều có Event hợp lệ - test riêng cho nhánh
    // Event bị chặn (DRAFT/CANCELLED/đã diễn ra) sẽ tự override lại
    // giá trị này trong chính test case đó.
    mockedEventRepo.findById.mockResolvedValue(buildPublishedEvent() as never);
  });

  it('tạo hold thành công khi CAS thắng ngay lần thử đầu tiên (happy path)', async () => {
    mockedTicketTypeRepo.findById.mockResolvedValue(buildTicketType());
    mockedHoldRepo.sumActiveHolds.mockResolvedValue(0); // chưa ai giữ chỗ nào khác
    mockedHoldRepo.tryBumpVersion.mockResolvedValue({ count: 1 }); // CAS thắng
    mockedHoldRepo.createHold.mockResolvedValue({
      id: 'hold-1',
      ticketTypeId: 'ticket-type-1',
      userId: 'user-1',
      quantity: 2,
      expiresAt: new Date(),
      createdAt: new Date(),
    });

    const result = await ticketHoldService.createHold({ ticketTypeId: 'ticket-type-1', quantity: 2 }, fakeUser);

    expect(result.id).toBe('hold-1');
    // Chỉ đọc TicketType đúng 1 lần trong vòng lặp - không có retry nào
    // xảy ra vì thắng ngay (lưu ý: còn thêm 1 lần đọc TicketType RIÊNG
    // ở bước kiểm tra Event trước vòng lặp - tổng cộng 2 lần gọi tới
    // ticketTypeRepository.findById cho toàn bộ hàm, nhưng chỉ 1 lần
    // bên trong vòng lặp retry là điều thực sự cần xác nhận ở đây).
    expect(mockedHoldRepo.tryBumpVersion).toHaveBeenCalledWith('ticket-type-1', 0);
    expect(mockedHoldRepo.tryBumpVersion).toHaveBeenCalledTimes(1);
  });

  it('từ chối NGAY LẬP TỨC (409) khi không đủ vé - không cần retry vì kết quả sẽ luôn giống nhau', async () => {
    mockedTicketTypeRepo.findById.mockResolvedValue(buildTicketType({ totalQuantity: 10, soldQuantity: 9 }));
    mockedHoldRepo.sumActiveHolds.mockResolvedValue(0); // available = 10 - 9 - 0 = 1

    await expect(
      ticketHoldService.createHold({ ticketTypeId: 'ticket-type-1', quantity: 5 }, fakeUser),
    ).rejects.toThrow(AppError);

    // Chỉ đọc 1 lần rồi từ chối ngay - KHÔNG gọi tryBumpVersion (không lãng phí 1 lần ghi vô ích)
    expect(mockedHoldRepo.tryBumpVersion).not.toHaveBeenCalled();
  });

  it('retry đúng 1 lần khi CAS thất bại lần đầu (có người chen ngang), rồi thắng ở lần 2', async () => {
    mockedTicketTypeRepo.findById.mockResolvedValue(buildTicketType());
    mockedHoldRepo.sumActiveHolds.mockResolvedValue(0);
    // Lần 1: CAS thất bại (count 0 - version đã bị người khác đổi).
    // Lần 2: CAS thành công.
    mockedHoldRepo.tryBumpVersion
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    mockedHoldRepo.createHold.mockResolvedValue({
      id: 'hold-2',
      ticketTypeId: 'ticket-type-1',
      userId: 'user-1',
      quantity: 1,
      expiresAt: new Date(),
      createdAt: new Date(),
    });

    const result = await ticketHoldService.createHold({ ticketTypeId: 'ticket-type-1', quantity: 1 }, fakeUser);

    expect(result.id).toBe('hold-2');
    // Đúng đặc điểm quan trọng nhất: CAS được thử đúng 2 LẦN (1 lần ban
    // đầu thất bại + 1 lần retry thành công) - CHỨNG MINH thuật toán
    // "đọc lại dữ liệu mới nhất mỗi vòng lặp" hoạt động đúng.
    expect(mockedHoldRepo.tryBumpVersion).toHaveBeenCalledTimes(2);
  });

  it('trả lỗi 409 "Hệ thống đang bận" sau khi hết số lần retry cho phép (tranh chấp quá cao)', async () => {
    mockedTicketTypeRepo.findById.mockResolvedValue(buildTicketType());
    mockedHoldRepo.sumActiveHolds.mockResolvedValue(0);
    // CAS thất bại LIÊN TỤC ở mọi lần thử - mô phỏng tranh chấp cực cao
    mockedHoldRepo.tryBumpVersion.mockResolvedValue({ count: 0 });

    await expect(
      ticketHoldService.createHold({ ticketTypeId: 'ticket-type-1', quantity: 1 }, fakeUser),
    ).rejects.toThrow('Hệ thống đang bận, vui lòng thử lại sau giây lát');

    // MAX_RETRY = 3 trong code hiện tại -> đúng 3 lần thử, KHÔNG retry
    // vô hạn (nguyên tắc quan trọng: tránh treo request, tự DoS chính mình)
    expect(mockedHoldRepo.tryBumpVersion).toHaveBeenCalledTimes(3);
    expect(mockedHoldRepo.createHold).not.toHaveBeenCalled();
  });

  it('tính đúng available khi có hold khác đang giữ chỗ tạm (chưa hết hạn)', async () => {
    // total=10, sold=5 -> còn 5 vé "trên giấy tờ", nhưng 4 vé đang bị
    // giữ tạm bởi hold khác -> available thật chỉ còn 1
    mockedTicketTypeRepo.findById.mockResolvedValue(buildTicketType({ totalQuantity: 10, soldQuantity: 5 }));
    mockedHoldRepo.sumActiveHolds.mockResolvedValue(4);

    await expect(
      ticketHoldService.createHold({ ticketTypeId: 'ticket-type-1', quantity: 2 }, fakeUser),
    ).rejects.toThrow('Chỉ còn 1 vé');
  });

  // --- Test mới: kiểm chứng luôn nhánh kiểm tra Event vừa fix ---
  it('từ chối 409 khi Event chưa PUBLISHED (VD còn DRAFT)', async () => {
    mockedTicketTypeRepo.findById.mockResolvedValue(buildTicketType());
    mockedEventRepo.findById.mockResolvedValue({
      id: 'event-1',
      status: 'DRAFT',
      startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    } as never);

    await expect(
      ticketHoldService.createHold({ ticketTypeId: 'ticket-type-1', quantity: 1 }, fakeUser),
    ).rejects.toThrow(/chưa mở bán|đã bị hủy|kết thúc/i);

    // Bị chặn NGAY từ bước kiểm tra Event - không tới lượt CAS/vòng lặp
    expect(mockedHoldRepo.tryBumpVersion).not.toHaveBeenCalled();
  });

  it('từ chối 409 khi Event đã qua startTime (đã diễn ra/kết thúc)', async () => {
    mockedTicketTypeRepo.findById.mockResolvedValue(buildTicketType());
    mockedEventRepo.findById.mockResolvedValue({
      id: 'event-1',
      status: 'PUBLISHED',
      startTime: new Date(Date.now() - 60 * 60 * 1000), // 1 giờ trước - đã diễn ra
    } as never);

    await expect(
      ticketHoldService.createHold({ ticketTypeId: 'ticket-type-1', quantity: 1 }, fakeUser),
    ).rejects.toThrow(/đã bắt đầu|đã diễn ra/i);

    expect(mockedHoldRepo.tryBumpVersion).not.toHaveBeenCalled();
  });
});