import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import mongoose from "mongoose";

import { InvalidFileTypeError } from "./upload.middleware";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof multer.MulterError) {
    const isSize = err.code === "LIMIT_FILE_SIZE";
    return res.status(400).json({
      success: false,
      code: isSize ? "FILE_TOO_LARGE" : "INVALID_UPLOAD",
      message: isSize
        ? "File size must not exceed 5 MB."
        : "Invalid file upload.",
    });
  }

  if (err instanceof InvalidFileTypeError)
    return res.status(400).json({
      success: false,
      code: "INVALID_FILE_TYPE",
      message: "Only jpeg, jpg, png, gif, and webp images are allowed.",
    });

  if (err instanceof mongoose.Error.ValidationError)
    return res.status(400).json({
      success: false,
      code: "INVALID_REQUEST_DATA",
      message: "Request data failed validation.",
    });

  if (err instanceof mongoose.Error.CastError)
    return res.status(400).json({
      success: false,
      code: "INVALID_REQUEST_DATA",
      message: "Request data contains an invalid value.",
    });

  console.error("Unhandled error:", err);

  res.status(500).json({
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message:
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred."
        : err.message,
  });
};
