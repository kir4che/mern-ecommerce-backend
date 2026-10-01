import type { ClientSession } from "mongoose";
import { Types } from "mongoose";

import { CouponModel } from "../models/coupon.model";
import { OrderModel } from "../models/order.model";
import { ProductModel } from "../models/product.model";
import {
  normalizeCouponCode,
  validateCouponForSubtotal,
} from "../utils/coupon";
import {
  aggregateOrderItemQuantities,
  generateOrderNo,
  type ValidatedOrderItemInput,
} from "../utils/order";
import { calculateShippingFee } from "../utils/shipping";

interface CreateOrderInput {
  couponCode?: string;
  idempotencyKey?: string;
  orderItems: readonly ValidatedOrderItemInput[];
  userId: Types.ObjectId;
}

interface CreateOrderResult {
  order: InstanceType<typeof OrderModel>;
  status: "created" | "already-exists";
}

interface CancelOrderResult {
  status: "canceled" | "already-processed" | "not-cancelable";
}

interface PrepareOrderStatusUpdateInput {
  readonly order: InstanceType<typeof OrderModel>;
  readonly role: "admin" | "user";
  readonly userId?: Types.ObjectId;
  readonly updateData: Record<string, unknown>;
}

export type OrderStatusUpdatePlan =
  | { readonly kind: "cancel" }
  | { readonly kind: "update"; readonly data: Record<string, unknown> };

const ADMIN_ORDER_FIELDS = ["status", "shippingTrackingNo", "note"]; // admin 可更新的訂單欄位
const USER_ORDER_FIELDS = ["name", "phone", "address", "note"]; // 一般 user 可更新的訂單欄位
const SHIPPING_TRACKING_MAX_LENGTH = 100;
const isDev = process.env.NODE_ENV !== "production";

export const findOrderById = (orderId: string) =>
  OrderModel.findById(orderId).lean();

export const listUserOrders = async (options: {
  filter: Record<string, unknown>;
  page: number;
  limit: number;
  sortField: string;
  sortDirection: 1 | -1;
}) => {
  const [orders, totalOrders] = await Promise.all([
    OrderModel.find(options.filter)
      .select(
        "_id userId orderNo name phone address orderItems subtotal shippingFee discount couponCode totalAmount status paymentStatus refundStatus shippingStatus shippingTrackingNo paymentMethod note createdAt"
      )
      .sort({ [options.sortField]: options.sortDirection })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .lean(),
    OrderModel.countDocuments(options.filter),
  ]);
  return { orders, totalOrders };
};

export const listAdminOrders = async (options: {
  filter: Record<string, unknown>;
  page: number;
  limit: number;
  sortField: string;
  sortDirection: 1 | -1;
}) => {
  const [orders, totalOrders] = await Promise.all([
    OrderModel.find(options.filter)
      .populate("userId", "name email")
      .sort({ [options.sortField]: options.sortDirection })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .lean(),
    OrderModel.countDocuments(options.filter),
  ]);
  return { orders, totalOrders };
};

export const findOrderForUpdate = (orderId: string) =>
  OrderModel.findById(orderId);

export const updateOrderWithState = (input: {
  orderId: string;
  state: { status: string; paymentStatus: string; shippingStatus: string };
  data: Record<string, unknown>;
}) =>
  OrderModel.findOneAndUpdate(
    { _id: input.orderId, ...input.state },
    input.data,
    { returnDocument: "after", runValidators: true }
  );

const isTransactionUnsupportedError = (err: unknown) =>
  err instanceof Error &&
  (err.message.includes("Transaction numbers are only allowed") ||
    err.message.includes("Transaction support is not enabled"));

// 驗證訂單狀態更新的權限與規則
export const prepareOrderStatusUpdate = ({
  order,
  role,
  userId,
  updateData,
}: PrepareOrderStatusUpdateInput): OrderStatusUpdatePlan => {
  // 任何角色都可以取消訂單，但需要權限檢查
  if (updateData.status === "canceled") {
    if (role !== "admin" && (!userId || !order.userId.equals(userId)))
      throw new Error("ORDER_UPDATE_FORBIDDEN");
    return { kind: "cancel" };
  }

  let filteredData: Record<string, unknown>;
  if (role === "admin") {
    // admin 只能更新白名單中的欄位
    filteredData = Object.fromEntries(
      Object.entries(updateData).filter(([key]) =>
        ADMIN_ORDER_FIELDS.includes(key)
      )
    );

    // admin 只能將訂單狀態改為 shipped 或 completed
    if (
      filteredData.status !== undefined &&
      !["shipped", "completed"].includes(filteredData.status as string)
    )
      throw new Error("ORDER_STATUS_TRANSITION_UNSUPPORTED");

    // 出貨前必須已付款且訂單狀態為 paid、物流狀態為 pending
    if (filteredData.status === "shipped") {
      if (
        typeof filteredData.shippingTrackingNo !== "string" ||
        !filteredData.shippingTrackingNo.trim() ||
        filteredData.shippingTrackingNo.length > SHIPPING_TRACKING_MAX_LENGTH
      )
        throw new Error("INVALID_SHIPPING_TRACKING_NO");

      if (
        order.paymentStatus !== "paid" ||
        order.status !== "paid" ||
        order.shippingStatus !== "pending"
      )
        throw new Error("ORDER_CANNOT_SHIP");

      filteredData.shippingStatus = "in_transit";
    }

    if (filteredData.status === "completed") {
      if (order.status !== "shipped" || order.shippingStatus !== "delivered")
        throw new Error("ORDER_CANNOT_COMPLETE");

      filteredData.shippingStatus = "delivered";
    }
  } else {
    // 一般 user（必須是訂單擁有者）
    if (!userId || !order.userId.equals(userId))
      throw new Error("ORDER_UPDATE_FORBIDDEN");

    if (updateData.status === "completed") {
      if (order.status !== "shipped" || order.shippingStatus !== "delivered")
        throw new Error("ORDER_CANNOT_COMPLETE");

      filteredData = { status: "completed", shippingStatus: "delivered" };
    } else {
      if (order.paymentStatus !== "unpaid" || order.status !== "created")
        throw new Error("ORDER_CANNOT_MODIFY");

      // 只允許修改白名單中的欄位
      filteredData = Object.fromEntries(
        Object.entries(updateData).filter(([key]) =>
          USER_ORDER_FIELDS.includes(key)
        )
      );
    }
  }

  // 若沒有任何可更新的欄位則拋錯
  if (Object.keys(filteredData).length === 0) throw new Error("NO_UPDATE_DATA");

  return { kind: "update", data: filteredData };
};

// 原子性建立訂單：庫存扣減、訂單、優惠券紀錄必須全有或全無
export const createOrderFromItems = async ({
  couponCode,
  idempotencyKey,
  orderItems,
  userId,
}: CreateOrderInput): Promise<CreateOrderResult> => {
  const session = await OrderModel.startSession(); // 開啟交易 session

  try {
    return await session.withTransaction(async () => {
      // 幂等性檢查：相同 idempotencyKey 的請求只會建立一筆訂單
      if (idempotencyKey) {
        const existing = await OrderModel.findOne({
          userId,
          idempotencyKey,
        }).session(session);
        if (existing) return { status: "already-exists", order: existing };
      }

      // 合併相同商品的數量，避免重複查詢
      const quantityByProductId = aggregateOrderItemQuantities(orderItems);
      const productIds = [...quantityByProductId.keys()];
      const products = await ProductModel.find({
        _id: { $in: productIds },
      }).session(session);
      const productMap = new Map(products.map((p) => [p._id.toString(), p]));

      // 組裝訂單項目，並確認所有商品都存在
      const computedOrderItems = orderItems.map((item) => {
        const product = productMap.get(item.productId);

        if (!product) throw new Error("PRODUCT_NOT_FOUND");
        return {
          productId: product._id,
          title: product.title,
          quantity: item.quantity,
          price: product.price,
          imageUrl: product.imageUrl,
        };
      });

      // 檢查庫存是否充足
      for (const [productId, quantity] of quantityByProductId) {
        const product = productMap.get(productId);

        if (!product) throw new Error("PRODUCT_NOT_FOUND");
        if (product.countInStock < quantity) throw new Error("OUT_OF_STOCK");
      }

      // 計算訂單金額：小計 + 運費 - 折扣
      const subtotal = computedOrderItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
      const shippingFee = calculateShippingFee(subtotal);
      let discount = 0;
      let appliedCouponCode: string | undefined;

      // 處理優惠券（若有提供）
      if (typeof couponCode === "string" && couponCode.trim()) {
        const normalizedCode = normalizeCouponCode(couponCode);
        const coupon = await CouponModel.findOne({
          code: normalizedCode,
        }).session(session);

        if (!coupon) throw new Error("COUPON_INVALID");

        const couponValidationResult = validateCouponForSubtotal(
          coupon,
          subtotal
        );

        if (!couponValidationResult.valid) throw new Error("COUPON_INVALID");

        discount = couponValidationResult.discountAmount;
        appliedCouponCode = normalizedCode;
      }

      const totalAmount = subtotal + shippingFee - discount;

      // 批次扣減庫存（使用 $gte 確保庫存充足，避免超賣）
      const bulkOps = [...quantityByProductId.entries()].map(
        ([productId, quantity]) => ({
          updateOne: {
            filter: { _id: productId, countInStock: { $gte: quantity } },
            update: { $inc: { countInStock: -quantity } },
          },
        })
      );

      if (bulkOps.length > 0) {
        const bulkResult = await ProductModel.bulkWrite(bulkOps, { session });

        // matchedCount 不足代表庫存狀態在檢查後發生變化，需回滾
        if (bulkResult.matchedCount !== bulkOps.length)
          throw new Error("STOCK_DEDUCTION_FAILED");
      }

      // 建立訂單，設定 24 小時付款期限
      const order = new OrderModel({
        orderNo: generateOrderNo(),
        userId,
        orderItems: computedOrderItems,
        subtotal,
        shippingFee,
        discount,
        couponCode: appliedCouponCode,
        totalAmount,
        paymentStatus: "unpaid",
        refundStatus: "not_required",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ...(idempotencyKey && { idempotencyKey }),
      });
      await order.save({ session });

      return { status: "created", order };
    });
  } catch (err: unknown) {
    // 處理 unique index 衝突（多個相同請求同時進來）
    const isDuplicateKeyError =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: unknown }).code === 11000;

    // 回傳既有訂單以維持幂等性
    if (isDuplicateKeyError && idempotencyKey) {
      const existing = await OrderModel.findOne({ userId, idempotencyKey });

      if (existing) return { status: "already-exists", order: existing };
    }

    throw err;
  } finally {
    await session.endSession();
  }
};

// 取消訂單（內部共用實作，避免 paid 暴露到外部。）
const cancelOrderByStatus = async (
  orderId: string,
  cancellationKind: "unpaid" | "paid"
): Promise<CancelOrderResult> => {
  const filter =
    cancellationKind === "unpaid"
      ? {
          // 未付款取消：訂單必須是建立中、未付款、待出貨
          paymentStatus: "unpaid" as const,
          status: "created" as const,
          shippingStatus: "pending" as const,
        }
      : {
          // 已付款取消：訂單必須是已付款、待出貨（需退款）
          paymentStatus: "paid" as const,
          status: "paid" as const,
          shippingStatus: "pending" as const,
        };

  const runCancellation = async (
    session?: ClientSession
  ): Promise<CancelOrderResult> => {
    const canceledOrder = await OrderModel.findOneAndUpdate(
      {
        _id: orderId,
        ...filter,
      },
      {
        $set: {
          status: "canceled",
          shippingStatus: "canceled",
          ...(cancellationKind === "paid" ? { refundStatus: "pending" } : {}),
        },
      },
      {
        returnDocument: "before",
        ...(session ? { session } : {}),
      }
    );

    if (!canceledOrder) return { status: "already-processed" };

    const quantityByProductId = aggregateOrderItemQuantities(
      canceledOrder.orderItems
    );

    for (const [productId, quantity] of quantityByProductId) {
      const updateResult =
        cancellationKind === "paid"
          ? await ProductModel.updateOne(
              { _id: productId },
              [
                {
                  $set: {
                    countInStock: { $add: ["$countInStock", quantity] },
                    salesCount: {
                      $max: [{ $subtract: ["$salesCount", quantity] }, 0],
                    },
                  },
                },
              ],
              {
                ...(session ? { session } : {}),
                updatePipeline: true,
              }
            )
          : await ProductModel.updateOne(
              { _id: productId },
              { $inc: { countInStock: quantity } },
              session ? { session } : undefined
            );

      if (updateResult.matchedCount === 0)
        console.error(
          "[ERROR]",
          `Product ${productId} was not found while restoring stock for canceled order ${canceledOrder._id.toString()}.`
        );
    }

    return { status: "canceled" };
  };

  const session = await OrderModel.startSession();

  try {
    // 用 transaction 確保「取消訂單 + 回補庫存」原子性（詳細說明見 createOrderFromItems）
    return await session.withTransaction(async () => runCancellation(session));
  } catch (err: unknown) {
    if (!isTransactionUnsupportedError(err)) throw err;

    if (isDev)
      console.log(
        `[INFO] MongoDB transaction unavailable during order cancellation. Falling back to non-transactional flow for order ${orderId}.`
      );

    return runCancellation();
  } finally {
    await session.endSession();
  }
};

// 取消 unpaid 訂單
export const cancelUnpaidOrder = (orderId: string) =>
  cancelOrderByStatus(orderId, "unpaid");

// 根據訂單當前付款狀態選擇對應的取消交易
export const cancelOrder = async (
  orderId: string
): Promise<CancelOrderResult> => {
  const order = await OrderModel.findById(orderId).select(
    "paymentStatus shippingStatus status"
  );

  if (!order || order.status === "canceled")
    return { status: "already-processed" };

  if (
    order.paymentStatus === "unpaid" &&
    order.status === "created" &&
    order.shippingStatus === "pending"
  )
    return cancelOrderByStatus(orderId, "unpaid");

  if (
    order.paymentStatus === "paid" &&
    order.shippingStatus === "pending" &&
    order.status === "paid"
  )
    return cancelOrderByStatus(orderId, "paid");

  return { status: "not-cancelable" };
};
