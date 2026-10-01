import type { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";

// 從 session 還原使用者資訊，但不阻擋未登入請求。
export const optionalAuthMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const { userId, role } = req.session;

  if (userId && Types.ObjectId.isValid(userId)) {
    req.userId = new Types.ObjectId(userId);
    req.role = role;
  }

  next();
};

// 從 session 還原使用者資訊，將 userId、role 帶入 req。
export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { userId, role } = req.session;

  if (!userId)
    return res.status(401).json({
      success: false,
      code: "NOT_AUTHENTICATED",
      message: "Please log in.",
    });

  req.userId = new Types.ObjectId(userId);
  req.role = role;
  next();
};

// 檢查使用者是否為 admin
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.role !== "admin")
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Admin access required.",
    });

  next();
};
