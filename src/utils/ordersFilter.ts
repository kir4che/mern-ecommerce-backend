import { QueryFilter, Types } from "mongoose";

import { IOrder } from "../models/order.model";
import { escapeRegex } from "./regex";

type OrderFilter = QueryFilter<IOrder>;

const ORDER_TYPE_FILTERS: Record<string, OrderFilter> = {
  "0": {}, // 全部
  "1": { paymentStatus: "unpaid", status: { $ne: "canceled" } }, // 待付款
  "2": {
    paymentStatus: "paid",
    shippingStatus: "pending",
    status: { $ne: "canceled" },
  }, // 待出貨
  "3": { status: "shipped" }, // 已出貨
  "4": { status: "completed" }, // 已完成
  "5": { status: "canceled" }, // 已取消
  "6": { status: "shipped", shippingStatus: "delivered" }, // 待取貨
};

interface OrderDateRange {
  startDate?: Date;
  endDate?: Date;
}

export const ordersFilter = (
  keyword?: string,
  type?: string,
  userId?: Types.ObjectId,
  dateRange?: OrderDateRange
) => {
  const filter: OrderFilter = {};

  if (userId) filter.userId = userId;

  if (dateRange?.startDate || dateRange?.endDate) {
    filter.createdAt = {};

    if (dateRange.startDate) filter.createdAt.$gte = dateRange.startDate;
    if (dateRange.endDate) filter.createdAt.$lte = dateRange.endDate;
  }

  // 篩出符合關鍵字的訂單編號或商品名稱
  if (keyword)
    filter.$or = [
      { orderNo: { $regex: escapeRegex(keyword), $options: "i" } },
      {
        orderItems: {
          $elemMatch: {
            title: { $regex: escapeRegex(keyword), $options: "i" },
          },
        },
      },
    ];

  // 篩出符合訂單類型的訂單
  if (type !== undefined && Object.hasOwn(ORDER_TYPE_FILTERS, type))
    Object.assign(filter, ORDER_TYPE_FILTERS[type]);

  return filter;
};
