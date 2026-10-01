import { OrderModel } from "../models/order.model";
import { cancelUnpaidOrder } from "../services/order.service";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 每 15 分鐘檢查一次
let intervalHandle: ReturnType<typeof setInterval> | null = null; // 用來確保函式只啟動一次
const isDev = process.env.NODE_ENV !== "production";

// 取消過期訂單
const cancelExpiredOrders = async () => {
  try {
    const now = new Date();
    // 計算「24 小時前」的時間點
    const expirationFallbackTime = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    );

    // 找出所有符合過期條件的未付款訂單
    const expiredOrders = await OrderModel.find({
      paymentStatus: "unpaid",
      status: { $ne: "canceled" },
      $or: [
        // 找有 expiresAt 且已過期的訂單，或是沒有 expiresAt 但 createdAt 超過 24 小時的訂單。
        { expiresAt: { $lt: now } },
        {
          createdAt: { $lt: expirationFallbackTime },
          expiresAt: null,
        },
      ],
    }).select("_id orderItems");

    if (expiredOrders.length === 0) return;

    let canceledCount = 0; // 記錄成功取消的數量

    // 逐一取消過期訂單
    for (const order of expiredOrders) {
      try {
        const result = await cancelUnpaidOrder(order._id.toString());
        if (result.status === "canceled") canceledCount++;
      } catch (err: unknown) {
        console.error(
          `[ERROR] Failed to cancel order ${order._id.toString()}`,
          err
        );
      }
    }

    if (canceledCount > 0)
      if (isDev)
        console.log(
          `[INFO] Auto-canceled ${canceledCount} expired unpaid order(s) and restored stock.`
        );
  } catch (err: unknown) {
    console.error(
      "[ERROR] Failed to auto-cancel expired orders job execution",
      err
    );
  }
};

export const startCancelExpiredOrdersJob = () => {
  if (intervalHandle) return;

  void cancelExpiredOrders();

  intervalHandle = setInterval(
    () => void cancelExpiredOrders(),
    CHECK_INTERVAL_MS
  );

  if (isDev)
    console.log(
      `[INFO] CancelExpiredOrders job started (interval: ${CHECK_INTERVAL_MS / 1000}s)`
    );
};
