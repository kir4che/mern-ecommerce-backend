import { Request, Response } from "express";
import { Types } from "mongoose";

import {
  cancelOrder,
  createOrderFromItems,
  findOrderById,
  findOrderForUpdate,
  listAdminOrders,
  listUserOrders,
  prepareOrderStatusUpdate,
  updateOrderWithState,
  type OrderStatusUpdatePlan,
} from "../services/order.service";
import { parsePositiveInt } from "../utils/number";
import { parseCreateOrderInput } from "../utils/order";
import { ordersFilter } from "../utils/ordersFilter";

const ALLOWED_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "totalAmount",
  "status",
  "orderNo",
] as const;

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const getDateBoundary = (value: unknown, boundary: "start" | "end") => {
  if (typeof value !== "string" || !DATE_INPUT_PATTERN.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;

  const date = new Date(
    `${value}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}+08:00`
  );

  return Number.isNaN(date.getTime()) ? null : date;
};

const getValidatedDateRange = (
  startDateInput: unknown,
  endDateInput: unknown
) => {
  const parsedStartDate =
    typeof startDateInput === "string" && startDateInput
      ? getDateBoundary(startDateInput, "start")
      : undefined;
  const parsedEndDate =
    typeof endDateInput === "string" && endDateInput
      ? getDateBoundary(endDateInput, "end")
      : undefined;

  if (
    (typeof startDateInput === "string" &&
      startDateInput &&
      parsedStartDate === null) ||
    (typeof endDateInput === "string" && endDateInput && parsedEndDate === null)
  )
    return { error: "INVALID_DATE_RANGE" as const };

  const startDate = parsedStartDate ?? undefined;
  const endDate = parsedEndDate ?? undefined;

  if (startDate && endDate && startDate > endDate)
    return { error: "INVALID_DATE_RANGE" as const };

  return { startDate, endDate };
};

// 只允許排序特定欄位
const isSortField = (
  value: unknown
): value is (typeof ALLOWED_SORT_FIELDS)[number] =>
  typeof value === "string" &&
  (ALLOWED_SORT_FIELDS as readonly string[]).includes(value);

const getOrdersByUser = async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 10,
    keyword,
    type,
    startDate,
    endDate,
    sortBy = "createdAt",
    orderBy = "desc",
  } = req.query;

  const pageNumber = parsePositiveInt(page, 1);
  const limitNumber = parsePositiveInt(limit, 10, 100);

  const validatedDateRange = getValidatedDateRange(startDate, endDate);

  if ("error" in validatedDateRange)
    return res.status(400).json({
      success: false,
      code: "INVALID_DATE_RANGE",
      message: "Invalid date range.",
    });

  const filter = ordersFilter(
    keyword as string,
    type as string,
    req.userId,
    validatedDateRange
  );

  const { orders, totalOrders } = await listUserOrders({
    filter,
    page: pageNumber,
    limit: limitNumber,
    sortField: isSortField(sortBy) ? sortBy : "createdAt",
    sortDirection: orderBy === "asc" ? 1 : -1,
  });

  res.status(200).json({
    success: true,
    orders,
    totalOrders,
    totalPages: Math.ceil(totalOrders / limitNumber),
    currentPage: pageNumber,
  });
};

const getOrderById = async (req: Request, res: Response) => {
  const orderId = req.params.id as string;

  if (!Types.ObjectId.isValid(orderId))
    return res.status(400).json({
      success: false,
      code: "INVALID_ORDER_ID",
      message: "Invalid order ID format.",
    });

  const order = await findOrderById(orderId);

  // 驗證訂單是否存在
  if (!order)
    return res.status(404).json({
      success: false,
      code: "ORDER_NOT_FOUND",
      message: "Order not found.",
    });

  // 驗證訂單所有權：只有訂單所有人或 admin 才能查看
  if (req.role !== "admin" && req.userId && !order.userId.equals(req.userId))
    return res.status(403).json({
      success: false,
      code: "ORDER_VIEW_FORBIDDEN",
      message: "You are not authorized to view this order.",
    });

  res.status(200).json({ success: true, order });
};

const getOrders = async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 10,
    keyword,
    type,
    userId,
    startDate,
    endDate,
    sortBy = "createdAt",
    orderBy = "desc",
  } = req.query;

  const pageNumber = parsePositiveInt(page, 1);
  const limitNumber = parsePositiveInt(limit, 10, 100);

  const validatedDateRange = getValidatedDateRange(startDate, endDate);

  if ("error" in validatedDateRange)
    return res.status(400).json({
      success: false,
      code: "INVALID_DATE_RANGE",
      message: "Invalid date range.",
    });

  const filter = ordersFilter(
    keyword as string,
    type as string,
    userId && Types.ObjectId.isValid(userId as string)
      ? new Types.ObjectId(userId as string)
      : undefined,
    validatedDateRange
  );

  const { orders, totalOrders } = await listAdminOrders({
    filter,
    page: pageNumber,
    limit: limitNumber,
    sortField: isSortField(sortBy) ? sortBy : "createdAt",
    sortDirection: orderBy === "asc" ? 1 : -1,
  });

  res.status(200).json({
    success: true,
    orders,
    totalOrders,
    totalPages: Math.ceil(totalOrders / limitNumber),
    currentPage: pageNumber,
  });
};

const createOrder = async (req: Request, res: Response) => {
  const parsedInput = parseCreateOrderInput(req.body);

  if (!parsedInput.ok) {
    const response =
      parsedInput.code === "ORDER_ITEMS_REQUIRED"
        ? {
            code: parsedInput.code,
            message: "Order items are required.",
          }
        : parsedInput.code === "INVALID_ORDER_ITEMS"
          ? {
              code: parsedInput.code,
              message: "Order items contain invalid productId or quantity.",
            }
          : {
              code: parsedInput.code,
              message: "Invalid order request.",
            };

    return res.status(400).json({ success: false, ...response });
  }

  try {
    const result = await createOrderFromItems({
      ...parsedInput.value,
      userId: req.userId!,
    });

    if (result.status === "already-exists")
      return res.status(200).json({
        success: true,
        code: "ORDER_ALREADY_EXISTS",
        message: "Order already exists.",
        order: result.order,
      });

    res.status(201).json({
      success: true,
      code: "ORDER_CREATED",
      message: "Order created Successfully!",
      order: result.order,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";

    if (message === "INVALID_ORDER_ITEMS")
      return res.status(400).json({
        success: false,
        code: "INVALID_ORDER_ITEMS",
        message: "Order items contain invalid productId or quantity.",
      });

    if (message === "PRODUCT_NOT_FOUND")
      return res.status(404).json({
        success: false,
        code: "PRODUCT_NOT_FOUND",
        message: "One or more products were not found.",
      });

    if (message === "OUT_OF_STOCK")
      return res.status(400).json({
        success: false,
        code: "OUT_OF_STOCK",
        message: "A product is out of stock. Please adjust your order.",
      });

    if (message === "COUPON_INVALID")
      return res.status(400).json({
        success: false,
        code: "COUPON_INVALID",
        message:
          "The coupon code is invalid or does not meet the requirements.",
      });

    if (message === "STOCK_DEDUCTION_FAILED")
      return res.status(409).json({
        success: false,
        code: "OUT_OF_STOCK",
        message: "Stock changed while creating the order. Please try again.",
      });

    throw err;
  }
};

const updateOrder = async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    return res.status(400).json({
      success: false,
      code: "INVALID_ORDER_REQUEST",
      message: "Order update body must be an object.",
    });

  const updateData = req.body as Record<string, unknown>;
  const orderId = req.params.id as string;

  if (!Types.ObjectId.isValid(orderId))
    return res.status(400).json({
      success: false,
      code: "INVALID_ORDER_ID",
      message: "Invalid order ID format.",
    });

  const order = await findOrderForUpdate(orderId);

  if (!order)
    return res.status(404).json({
      success: false,
      code: "ORDER_NOT_FOUND",
      message: "Order not found.",
    });

  const role = req.role === "admin" ? "admin" : "user";
  let updatePlan: OrderStatusUpdatePlan;

  try {
    updatePlan = prepareOrderStatusUpdate({
      order,
      role,
      userId: req.userId,
      updateData,
    });
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    let status = 500;
    let message = "Order update failed.";

    if (code === "ORDER_UPDATE_FORBIDDEN") {
      status = 403;
      message = "You are not authorized to update this order.";
    } else if (code === "ORDER_STATUS_TRANSITION_UNSUPPORTED") {
      status = 400;
      message = "This order status transition is not supported yet.";
    } else if (code === "INVALID_SHIPPING_TRACKING_NO") {
      status = 400;
      message = "A valid shipping tracking number is required.";
    } else if (code === "ORDER_CANNOT_SHIP") {
      status = 400;
      message = "Only paid orders waiting to ship can be shipped.";
    } else if (code === "ORDER_CANNOT_COMPLETE") {
      status = 400;
      message = "Only delivered orders can be completed.";
    } else if (code === "ORDER_CANNOT_MODIFY") {
      status = 400;
      message = "This order has already been processed and cannot be modified.";
    } else if (code === "NO_UPDATE_DATA") {
      status = 400;
      message = "No supported order fields were provided.";
    }

    return res.status(status).json({
      success: false,
      code,
      message,
    });
  }

  if (updatePlan.kind === "cancel") {
    const cancelResult = await cancelOrder(orderId);

    // 若訂單處理過了，則無法取消。
    if (cancelResult.status === "not-cancelable")
      return res.status(400).json({
        success: false,
        code: "ORDER_CANNOT_CANCEL",
        message: "Only orders that have not been shipped can be canceled.",
      });

    return res.status(200).json({
      success: true,
      code: "ORDER_CANCELED",
      message: "Order canceled successfully.",
    });
  }

  const updatedOrder = await updateOrderWithState({
    orderId,
    state: {
      status: order.status,
      paymentStatus: order.paymentStatus,
      shippingStatus: order.shippingStatus,
    },
    data: updatePlan.data,
  });

  if (!updatedOrder)
    return res.status(409).json({
      success: false,
      code: "ORDER_STATE_CHANGED",
      message: "Order state changed. Please refresh and try again.",
    });

  return res.status(200).json({
    success: true,
    order: updatedOrder,
  });
};

export { getOrdersByUser, getOrderById, getOrders, createOrder, updateOrder };
