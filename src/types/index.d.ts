export {};

declare global {
  namespace Express {
    interface Request {
      userId?: import("mongoose").Types.ObjectId;
      role?: string;
    }
  }
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    role?: string;
  }
}
