// src/utils/apiResponse.ts
//
// Tại sao cần chuẩn hóa format response thay vì mỗi endpoint tự trả
// JSON tùy ý? Vì Frontend (hoặc Postman/Swagger test) cần 1 hợp đồng
// (contract) NHẤT QUÁN để biết chắc chắn "success" nằm ở đâu, "data"
// nằm ở đâu, lỗi thì đọc field nào. Thiếu chuẩn này, mỗi module trả
// JSON khác nhau -> FE phải viết code xử lý riêng cho từng API, rất
// dễ lỗi và khó maintain khi team đông người.

export class ApiResponse {
  static success<T>(data: T, message = 'Thành công') {
    return {
      success: true,
      message,
      data,
    };
  }

  static paginated<T>(
    data: T[],
    meta: { page: number; limit: number; total: number },
  ) {
    return {
      success: true,
      data,
      meta: {
        ...meta,
        totalPages: Math.ceil(meta.total / meta.limit),
      },
    };
  }
}

// AppError: lớp lỗi nghiệp vụ tự định nghĩa, phân biệt với lỗi hệ thống
// (bug thật). Khi Service throw new AppError(...), error middleware biết
// đây là lỗi "có chủ đích" (VD: "Email đã tồn tại") và trả đúng status
// code + message rõ ràng cho client - khác với lỗi crash ngoài ý muốn.
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
