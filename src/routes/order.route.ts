import { Router } from "express";

import {
  getAdminDashboardStats,
  getAdminOrderAnalytics,
} from "../controllers/order-analytics.controller";
import {
  createOrder,
  getOrderById,
  getOrders,
  getOrdersByUser,
  updateOrder,
} from "../controllers/order.controller";
import { authMiddleware, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

router.use(authMiddleware);

router.route("/").get(getOrdersByUser).post(createOrder);
router.route("/:id").get(getOrderById).patch(updateOrder);

const adminRouter = Router();
adminRouter.use(authMiddleware, isAdmin);
adminRouter.route("/stats").get(getAdminDashboardStats);
adminRouter.route("/analytics").get(getAdminOrderAnalytics);
adminRouter.route("/").get(getOrders);

export { router as orderRouter, adminRouter as adminOrderRouter };
