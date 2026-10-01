import "dotenv/config";

import MongoStore from "connect-mongo";
import cors from "cors";
import express from "express";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import session = require("express-session");
import helmet from "helmet";

import { cartRouter } from "./routes/cart.route";
import { categoryRouter } from "./routes/category.route";
import { contactRouter } from "./routes/contact.route";
import { couponRouter } from "./routes/coupon.route";
import { newsRouter } from "./routes/news.route";
import { adminOrderRouter, orderRouter } from "./routes/order.route";
import { paymentRouter } from "./routes/payment.route";
import { productRouter } from "./routes/product.route";
import { tagRouter } from "./routes/tag.route";
import { uploadRouter } from "./routes/upload.route";
import { adminUserRouter, userRouter } from "./routes/user.route";

import {
  authLimiter,
  generalLimiter,
} from "./middlewares/rateLimit.middleware";

import { SESSION_NAME } from "./config/session";
import "./config/cloudinary";
import { errorHandler } from "./middlewares/error.middleware";

const app = express();

// 1 代表信任第一層代理（部署後端的平台），以取得用戶端的 IP 位址。
app.set("trust proxy", 1);

const isProduction = process.env.NODE_ENV === "production";

const frontendUrl =
  process.env.FRONTEND_URL ||
  (isProduction ? undefined : "http://localhost:5173");

if (!frontendUrl) throw new Error("FRONTEND_URL is required.");
if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required.");

const allowedOrigins = frontendUrl.split(",").map((s) => s.trim());

const corsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "ngrok-skip-browser-warning",
  ],
  credentials: true, // 允許帶 cookie
};

app.use(cors(corsOptions));
app.use(helmet());
// limit 避免未授權請求用超大 payload 消耗 API 記憶體
app.use(express.json({ limit: "1mb" }));

app.use(
  session({
    name: SESSION_NAME,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new MongoStore({
      mongoUrl: process.env.MONGO_URI as string,
      collectionName: "sessions",
    }),
    cookie: {
      httpOnly: true,
      secure: isProduction,
      // 跨站請求時，瀏覽器不會帶上 cookie，除非 SameSite 設為 "none" 且 secure 為 true。
      sameSite: isProduction ? "none" : "lax",
    },
  })
);

// 解析 application/x-www-form-urlencoded（綠界金流付款表單回傳的資料格式）
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// 全域 rate limiting
app.use("/api", generalLimiter);

// 首頁路由，測試伺服器是否正常。
app.get("/", (_req, res) => res.send("Express on Vercel."));
app.get("/health", (_req, res) =>
  res.status(200).json({ success: true, status: "ok" })
);

// 設定 API 路由
app.use("/api/user/login", authLimiter);
app.use("/api/user/register", authLimiter);
app.use("/api/user/reset-password", authLimiter);
app.use("/api/user", userRouter);
app.use("/api/products", productRouter);
app.use("/api/news", newsRouter);
app.use("/api/cart", cartRouter);
app.use("/api/orders", orderRouter);
app.use("/api/admin/orders", adminOrderRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/coupons", couponRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/contact", contactRouter);
app.use("/api/admin/users", adminUserRouter);
app.use("/api/tags", tagRouter);

app.use((_req, res) =>
  res.status(404).json({
    success: false,
    code: "NOT_FOUND",
    message: "Resource not found.",
  })
);

app.use(errorHandler);

export default app;
