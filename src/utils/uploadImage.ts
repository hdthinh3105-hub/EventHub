// src/utils/uploadImage.ts
import { cloudinary } from '../config/cloudinary';

// Cloudinary SDK cung cấp upload_stream (nhận luồng dữ liệu) thay vì
// upload thẳng từ đường dẫn file - khớp với cách Multer memoryStorage
// giữ file dạng Buffer trong RAM, không phải đường dẫn file thật.
export function uploadBufferToCloudinary(
  buffer: Buffer,
  folder: string,
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error || !result) {
          return reject(error ?? new Error('Upload ảnh thất bại'));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}
