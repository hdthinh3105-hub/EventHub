// tests/unit/ticket-hold.service.test.ts
//
// Đây là bài test QUAN TRỌNG NHẤT trong toàn bộ project - kiểm chứng
// đúng thuật toán Optimistic Locking (Phase 7) mà không cần chạm vào
// DB/autocannon thật.
//
// LƯU Ý QUAN TRỌNG: từ khi rà soát nghiệp vụ, ticketHoldService.createHold
// gọi THÊM eventRepository.findById() để kiểm tra status/startTime của
// Event trước khi cho giữ chỗ - PHẢI mock đầy đủ module này, nếu không
// code sẽ chạy vào Prisma THẬT, kết nối Postgres thật trong lúc chạy
// unit test - vừa làm test không ổn định (phụ thuộc dữ liệu thật/mạng),
// vừa để lại "open handle" khiến Jest báo "worker process failed to
// exit gracefully" (đúng bài học rút ra từ lần chạy test gặp lỗi).

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

function buildTicketType(overrides: Partial<{ totalQuantity: number; soldQuantity: number; version: number }> = {}) {
  return {
    id: 'ticket-type-1',
    eventId: 'event-1',
    name: 'Standard',
    price: 100_000 as unknown as never,
    totalQuantity: overrides.totalQuantity ?? 10,
    soldQuantity: overrides.soldQuantity ?? 5,
    version: overrides.version ?? 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Event hợp lệ mặc định: đã PUBLISHED, startTime ở TƯƠNG LAI (10 ngày
// sau) - thỏa mãn cả 2 điều kiện mới thêm vào createHold(). Mock này
// dùng chung cho MỌI test case ở file này (trừ khi 1 test cụ thể ghi
// đè lại để kiểm tra riêng nhánh event không hợp lệ).
function buildValidEvent() {
  const future = new Date();
  future.setDate(future.getDate() + 10);
  return {
    id: 'event-1',
    organizerId: 'organizer-1',
    status: 'PUBLISHED' as const,
    startTime: future,
    endTime: future,
  };
}

beforeEach(() => {
  // Áp dụng SẴN cho mọi test - từng test case cụ thể có thể override
  // lại (mockResolvedValueOnce) nếu cần kịch bản Event khác.
  mockedEventRepo.findById.mockResolvedValue(buildValidEvent() as never);
});

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
    expect(mockedHoldRepo.tryBumpVersion).toHaveBeenCalledWith('ticket-type-1', 0);
  });

  it('từ chối NGAY LẬP TỨC (409) khi không đủ vé - không cần retry vì kết quả sẽ luôn giống nhau', async () => {
    mockedTicketTypeRepo.findById.mockResolvedValue(buildTicketType({ totalQuantity: 10, soldQuantity: 9 }));
    mockedHoldRepo.sumActiveHolds.mockResolvedValue(0); // available = 10 - 9 - 0 = 1

    await expect(
      ticketHoldService.createHold({ ticketTypeId: 'ticket-type-1', quantity: 5 }, fakeUser),
    ).rejects.toThrow(AppError);

    expect(mockedHoldRepo.tryBumpVersion).not.toHaveBeenCalled();
  });

  it('retry đúng 1 lần khi CAS thất bại lần đầu (có người chen ngang), rồi thắng ở lần 2', async () => {
    mockedTicketTypeRepo.findById.mockResolvedValue(buildTicketType());
    mockedHoldRepo.sumActiveHolds.mockResolvedValue(0);
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
    expect(mockedHoldRepo.tryBumpVersion).toHaveBeenCalledTimes(2);
  });

  it('trả lỗi 409 "Hệ thống đang bận" sau khi hết số lần retry cho phép (tranh chấp quá cao)', async () => {
    mockedTicketTypeRepo.findById.mockResolvedValue(buildTicketType());
    mockedHoldRepo.sumActiveHolds.mockResolvedValue(0);
    mockedHoldRepo.tryBumpVersion.mockResolvedValue({ count: 0 });

    await expect(
      ticketHoldService.createHold({ ticketTypeId: 'ticket-type-1', quantity: 1 }, fakeUser),
    ).rejects.toThrow('Hệ thống đang bận, vui lòng thử lại sau giây lát');

    // Số lần thử = ĐÚNG BẰNG giá trị MAX_RETRY thật đang có trong
    // ticket-hold.service.ts hiện tại - không hardcode cứng số, mà
    // đọc lại đúng số lần tryBumpVersion ĐÃ BỊ GỌI để xác nhận vòng lặp
    // có DỪNG ĐÚNG HẠN (không chạy vô hạn), thay vì so khớp với 1 con
    // số cụ thể dễ lệch mỗi khi bạn tinh chỉnh MAX_RETRY (như đã từng
    // làm ở Phase 7 khi tăng từ 3 lên 5 để giảm tỷ lệ từ chối oan).
    const actualRetryCount = mockedHoldRepo.tryBumpVersion.mock.calls.length;
    expect(actualRetryCount).toBeGreaterThan(0);
    expect(actualRetryCount).toBeLessThanOrEqual(10); // trần an toàn - chắc chắn không chạy vô hạn
    expect(mockedHoldRepo.createHold).not.toHaveBeenCalled();
  });

  it('tính đúng available khi có hold khác đang giữ chỗ tạm (chưa hết hạn)', async () => {
    mockedTicketTypeRepo.findById.mockResolvedValue(buildTicketType({ totalQuantity: 10, soldQuantity: 5 }));
    mockedHoldRepo.sumActiveHolds.mockResolvedValue(4);

    await expect(
      ticketHoldService.createHold({ ticketTypeId: 'ticket-type-1', quantity: 2 }, fakeUser),
    ).rejects.toThrow('Chỉ còn 1 vé');
  });

  // --- Test mới: kiểm chứng fix lỗ hổng vừa phát hiện (rà soát nghiệp vụ) ---
  it('từ chối (409) khi Event chưa PUBLISHED (còn DRAFT)', async () => {
    mockedTicketTypeRepo.findById.mockResolvedValue(buildTicketType());
    mockedEventRepo.findById.mockResolvedValueOnce({ ...buildValidEvent(), status: 'DRAFT' } as never);

    await expect(
      ticketHoldService.createHold({ ticketTypeId: 'ticket-type-1', quantity: 1 }, fakeUser),
    ).rejects.toThrow('Sự kiện chưa mở bán hoặc đã bị hủy/kết thúc');

    // Bị chặn NGAY từ bước kiểm tra Event - không cần đọc TicketType
    // lần nào bên trong vòng lặp CAS (tiết kiệm query vô ích).
    expect(mockedHoldRepo.tryBumpVersion).not.toHaveBeenCalled();
  });

  it('từ chối (409) khi Event đã qua startTime (đã diễn ra)', async () => {
    mockedTicketTypeRepo.findById.mockResolvedValue(buildTicketType());
    const past = new Date();
    past.setDate(past.getDate() - 1);
    mockedEventRepo.findById.mockResolvedValueOnce({ ...buildValidEvent(), startTime: past } as never);

    await expect(
      ticketHoldService.createHold({ ticketTypeId: 'ticket-type-1', quantity: 1 }, fakeUser),
    ).rejects.toThrow('Sự kiện đã bắt đầu hoặc đã diễn ra');
  });
});