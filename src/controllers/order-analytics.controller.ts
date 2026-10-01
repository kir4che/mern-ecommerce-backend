import { Request, Response } from "express";
import {
  getDashboardStats,
  getOrderAnalytics,
} from "../services/order-analytics.service";

const getAdminOrderAnalytics = async (req: Request, res: Response) =>
  res
    .status(200)
    .json({ success: true, ...(await getOrderAnalytics(req.query.range)) });
const getAdminDashboardStats = async (_req: Request, res: Response) =>
  res.status(200).json({ success: true, ...(await getDashboardStats()) });
export { getAdminDashboardStats, getAdminOrderAnalytics };
