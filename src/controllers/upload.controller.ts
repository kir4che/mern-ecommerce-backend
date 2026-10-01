import { Request, Response } from "express";
import { uploadImage as uploadImageService } from "../services/upload.service";
const uploadImage = async (req: Request, res: Response) => {
  if (!req.file)
    return res.status(400).json({
      success: false,
      code: "IMAGE_FILE_REQUIRED",
      message: "Please upload an image.",
    });
  const result = await uploadImageService(req.file);
  return res.json({
    success: true,
    code: "IMAGE_UPLOADED",
    message: "Image uploaded successfully!",
    imageUrl: result.secure_url,
  });
};
export { uploadImage };
