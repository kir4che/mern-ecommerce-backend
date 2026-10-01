import multer from "multer";
import path from "node:path";

export class InvalidFileTypeError extends Error {
  constructor() {
    super("Only image files (jpeg, jpg, png, gif, webp) are allowed.");
    this.name = "InvalidFileTypeError";
  }
}

// 將上傳檔案存在記憶體中，方便後續上傳到 Cloudinary。
const storage = multer.memoryStorage();

// 限制上傳檔案的類型、大小
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) return cb(null, true);

  cb(new InvalidFileTypeError());
};

export const uploadImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
