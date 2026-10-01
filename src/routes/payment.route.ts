import { Router } from "express";

import { authMiddleware } from "../middlewares/auth.middleware";
import {
  createPaymentHandler,
  devPayOrder,
  handlePaymentCallback,
} from "../controllers/payment.controller";

const router = Router();

router.post("/callback", handlePaymentCallback);

router.use(authMiddleware);
router.post("/", createPaymentHandler);
router.post("/dev-pay/:orderId", devPayOrder);

export { router as paymentRouter };
