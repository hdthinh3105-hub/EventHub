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

import { ticketHoldService } from '../../src/modules/ticket-hold/ticket-hold.service';
import { ticketTypeRepository } from '../../src/modules/ticket-type/ticket-type.repository';
import { ticketHoldRepository } from '../../src/modules/ticket-hold/ticket-hold.repository';
import { AppError } from '../../src/utils/apiResponse';
import { JwtPayload } from '../../src/utils/jwt';

jest.mock('../../src/modules/ticket-type/ticket-type.repository');
jest.mock('../../src/modules/ticket-hold/ticket-hold.repository');

const mockedTicketTypeRepo = ticketTypeRepository as jest.Mocked<typeof ticketTypeRepository>;
const mockedHoldRepo = ticketHoldRepository as jest.Mocked<typeof ticketHoldRepository>;

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

describe('ticketHoldService.createHold - Optimistic Locking', () => {
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
    // Chỉ đọc TicketType đúng 1 lần - không có retry nào xảy ra vì thắng ngay
    expect(mockedTicketTypeRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedHoldRepo.tryBumpVersion).toHaveBeenCalledWith('ticket-type-1', 0);
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
    // Đúng đặc điểm quan trọng nhất: đọc lại TicketType 2 LẦN (1 lần ban
    // đầu + 1 lần retry) - CHỨNG MINH thuật toán "đọc lại dữ liệu mới
    // nhất mỗi vòng lặp" hoạt động đúng, không dùng data cũ từ vòng trước.
    expect(mockedTicketTypeRepo.findById).toHaveBeenCalledTimes(2);
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
});
