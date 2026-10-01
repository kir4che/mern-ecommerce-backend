import { type UploadApiResponse } from "cloudinary";

import { cloudinary } from "../config/cloudinary";

export const uploadImage = (file: { buffer: Buffer }) =>
  new Promise<UploadApiResponse>((resolve, reject) => {
    // 使用 Cloudinary 上傳圖片
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder: "products",
        transformation: { quality: "auto", fetch_format: "auto" },
      },
      (error, result) => {
        if (error || !result)
          return reject(error ?? new Error("UPLOAD_FAILED"));
        resolve(result);
      }
    );

    // 確保圖片資料存在並上傳給 Cloudinary
    if (file.buffer?.length) uploadStream.end(file.buffer);
    else reject(new Error("INVALID_IMAGE_DATA"));
  });
