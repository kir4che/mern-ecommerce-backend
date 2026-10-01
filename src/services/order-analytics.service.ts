import { CouponModel } from "../models/coupon.model";
import { OrderModel } from "../models/order.model";
import { ProductModel } from "../models/product.model";

/**
 * 根據時間範圍產生日期標籤
 * - 12m：YYYY-MM，每月一個標籤。
 * - 其他（7d / 30d / 90d）：格式 YYYY-MM-DD，每天一個標籤。
 */
const generateDateLabels = (
  range: string,
  start: Date,
  end: Date
): string[] => {
  const labels: string[] = [];
  const current = new Date(start);
  if (range === "12m") {
    while (current <= end) {
      labels.push(
        `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`
      );
      current.setMonth(current.getMonth() + 1);
    }
  } else {
    while (current <= end) {
      labels.push(
        `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`
      );
      current.setDate(current.getDate() + 1);
    }
  }
  return labels;
};
const getTrendLabel = (date: Date, range: string) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  if (range === "12m") return `${date.getFullYear()}-${month}`;
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, "0")}`;
};

export const getOrderAnalytics = async (rangeInput: unknown) => {
  const now = new Date();
  const range = ["7d", "30d", "90d", "12m"].includes(rangeInput as string)
    ? (rangeInput as string)
    : "30d";
  const startDate =
    range === "7d"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
      : range === "90d"
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89)
        : range === "12m"
          ? new Date(now.getFullYear(), now.getMonth() - 11, 1)
          : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const orders = await OrderModel.find({ createdAt: { $gte: startDate } })
    .select("createdAt paymentStatus status totalAmount orderItems")
    .lean();
  // 營收 / 各日期訂單量 / 訂單狀態統計 / 商品銷售排行
  const orderCountByLabel = new Map<string, number>();
  const statusCount = new Map<string, number>();
  const revenueByLabel = new Map<string, number>();
  const productSales = new Map<
    string,
    { title: string; quantity: number; revenue: number }
  >();
  let totalRevenue = 0;
  let paidOrderCount = 0;
  let completedOrders = 0;
  for (const order of orders) {
    const label = getTrendLabel(order.createdAt, range);
    orderCountByLabel.set(label, (orderCountByLabel.get(label) ?? 0) + 1);
    statusCount.set(order.status, (statusCount.get(order.status) ?? 0) + 1);
    if (order.status === "completed") completedOrders++;
    // 只計入「已付款」且「未取消」的訂單到營收統計
    if (order.paymentStatus !== "paid" || order.status === "canceled") continue;
    paidOrderCount++;
    totalRevenue += order.totalAmount;
    revenueByLabel.set(
      label,
      (revenueByLabel.get(label) ?? 0) + order.totalAmount
    );
    // 逐筆累加商品的銷量、營收
    for (const item of order.orderItems) {
      const productKey = item.productId.toString();
      const existing = productSales.get(productKey) ?? {
        title: item.title,
        quantity: 0,
        revenue: 0,
      };
      existing.quantity += item.quantity;
      existing.revenue += item.price * item.quantity;
      productSales.set(productKey, existing);
    }
  }
  // 補齊沒有訂單的日期
  const labels = generateDateLabels(range, startDate, now);
  // 取銷售量前 5 名的商品
  return {
    summary: {
      totalRevenue,
      totalOrders: orders.length,
      averageOrderValue: paidOrderCount ? totalRevenue / paidOrderCount : 0,
      completedOrders,
    },
    revenueTrend: labels.map((label) => ({
      label,
      revenue: revenueByLabel.get(label) ?? 0,
    })),
    orderTrend: labels.map((label) => ({
      label,
      orders: orderCountByLabel.get(label) ?? 0,
    })),
    orderStatusDistribution: [...statusCount.entries()].map(
      ([status, count]) => ({ status, count })
    ),
    topProducts: [...productSales.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5),
  };
};

export const getDashboardStats = async () => {
  const [totalOrders, pendingOrders, totalProducts, activeCoupons] =
    await Promise.all([
      OrderModel.countDocuments(), // 全部訂單數
      OrderModel.countDocuments({
        paymentStatus: "paid",
        shippingStatus: "pending",
        status: { $ne: "canceled" },
      }), // 待出貨：已付款 + 未出貨 + 未取消
      ProductModel.countDocuments(), // 商品總數
      CouponModel.countDocuments({
        isActive: true,
        expiryDate: { $gt: new Date() },
      }), // 啟用中且未過期的優惠券
    ]);
  return { totalOrders, pendingOrders, totalProducts, activeCoupons };
};
