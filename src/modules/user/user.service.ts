// src/modules/user/user.service.ts
import { userRepository } from './user.repository';
import { AppError } from '../../utils/apiResponse';
import { AssignRoleInput } from './user.validation';
import { JwtPayload } from '../../utils/jwt';

export const userService = {
  list() {
    return userRepository.findAll();
  },

  async assignRole(targetUserId: string, input: AssignRoleInput, actor: JwtPayload) {
    const targetUser = await userRepository.findById(targetUserId);
    if (!targetUser) {
      throw new AppError('Không tìm thấy user', 404);
    }

    // Chặn Admin tự đổi role của chính mình - tránh trường hợp Admin
    // vô tình (hoặc bị lừa qua API) tự hạ quyền bản thân, dẫn tới hệ
    // thống có thể mất người quản trị. Đây là nguyên tắc phòng thủ phổ
    // biến trong các hệ thống quản trị thật.
    if (targetUser.id === actor.userId) {
      throw new AppError('Không thể tự thay đổi role của chính mình', 400);
    }

    const role = await userRepository.findRoleByName(input.roleName);
    if (!role) {
      // Về lý thuyết không xảy ra vì Zod enum đã giới hạn giá trị hợp lệ,
      // nhưng vẫn kiểm tra vì role có thể bị xóa nhầm khỏi DB.
      throw new AppError('Role không tồn tại trong hệ thống', 400);
    }

    return userRepository.updateRole(targetUserId, role.id);
  },
};
