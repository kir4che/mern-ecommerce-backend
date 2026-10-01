import * as crypto from "crypto";
import mongoose, { Types } from "mongoose";
import ShortUniqueId from "short-unique-id";

import { OrderModel } from "../models/order.model";
import { ProductModel } from "../models/product.model";
import { cancelUnpaidOrder } from "./order.service";
import { aggregateOrderItemQuantities } from "../utils/order";

interface PayableOrderInput {
  readonly orderId: string;
  readonly userId: Types.ObjectId;
  readonly isAdmin: boolean;
}

interface CreatePaymentRequestInput extends PayableOrderInput {
  readonly name: string;
  readonly phone: string;
  readonly address: string;
  readonly note?: string;
  readonly paymentMethod: string;
}

interface CreatePaymentRequestResult {
  readonly params: Record<string, unknown>;
}

interface FinalizePaidOrderInput {
  orderId: string;
  paymentDate: Date;
  tradeNo?: string;
}

export const findPaymentCallbackOrder = (orderId: string) =>
  OrderModel.findById(orderId);

// 付款失敗只保留原本的 unpaid 狀態，不能讓取消單被 callback 復活，也不把失敗時間當成付款時間。
export const markPaymentFailure = (orderId: string) =>
  OrderModel.updateOne(
    { _id: orderId, paymentStatus: "unpaid", status: "created" },
    { $set: { refundStatus: "not_required" } }
  );

/**
 * 回傳 finalizePaidOrder 的處理結果
 * - paid：正常付款成功（created → paid）
 * - already-processed：付款處理過了
 * - late-payment-recorded：延遲付款 ex. 訂單已被取消但使用者付款了，記錄付款但訂單維持 canceled。
 */
interface FinalizeResult {
  status: "paid" | "already-processed" | "late-payment-recorded";
}

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error("PAYMENT_CONFIG_MISSING");
  return value;
};

// 載入可付款的訂單，並驗證權限與訂單狀態。
export const loadPayableOrder = async ({
  orderId,
  userId,
  isAdmin,
}: PayableOrderInput) => {
  if (!Types.ObjectId.isValid(orderId)) throw new Error("INVALID_ORDER_ID");

  const order = await OrderModel.findById(orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");

  // 若非 admin 則必須是訂單擁有者才能付款
  if (!isAdmin && !order.userId.equals(userId))
    throw new Error("ORDER_PAYMENT_FORBIDDEN");

  if (order.paymentStatus !== "unpaid") throw new Error("ORDER_ALREADY_PAID");

  if (order.status !== "created" || order.shippingStatus !== "pending")
    throw new Error("ORDER_CANNOT_PAY");

  return order;
};

// 產生綠界付款請求的參數，並更新訂單的付款資訊。
export const createPaymentRequest = async ({
  orderId,
  userId,
  isAdmin,
  name,
  phone,
  address,
  note,
  paymentMethod,
}: CreatePaymentRequestInput): Promise<CreatePaymentRequestResult> => {
  const order = await loadPayableOrder({ orderId, userId, isAdmin });
  const now = new Date();

  // 訂單已過期且未付款則取消
  if (order.expiresAt && order.expiresAt < now) {
    await cancelUnpaidOrder(order._id.toString());
    throw new Error("ORDER_EXPIRED");
  }

  const merchantId = getRequiredEnv("MERCHANT_ID");
  const backendUrl = getRequiredEnv("BACKEND_URL");
  const frontendUrl = getRequiredEnv("FRONTEND_URL");
  const hashKey = getRequiredEnv("HASH_KEY");
  const hashIv = getRequiredEnv("HASH_IV");

  const { totalAmount, orderItems } = order;
  const uid = new ShortUniqueId({ length: 20 });
  // ECPay MerchantTradeNo 不可重複，每次重新付款都必須建立新的交易編號。
  const tradeNo = uid.randomUUID();
  const pad = (value: number) => String(value).padStart(2, "0");
  const merchantTradeDate = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const tradeNoFilter = order.tradeNo
    ? [{ tradeNo: order.tradeNo }]
    : [{ tradeNo: { $exists: false } }, { tradeNo: null }];
  const expiresAtFilter = [
    { expiresAt: { $exists: false } },
    { expiresAt: null },
    { expiresAt: { $gte: now } },
  ];

  let itemName = orderItems
    .map((item) => `${item.title} x ${item.quantity}`)
    .join("#");

  if (itemName.length > 400) {
    const truncated = itemName.substring(0, 400);
    const lastHashIndex = truncated.lastIndexOf("#");
    itemName =
      lastHashIndex > 0 ? truncated.substring(0, lastHashIndex) : truncated;
  }

  const updatedOrder = await OrderModel.findOneAndUpdate(
    {
      _id: order._id,
      status: "created",
      paymentStatus: "unpaid",
      shippingStatus: "pending",
      $and: [{ $or: tradeNoFilter }, { $or: expiresAtFilter }],
    },
    {
      $set: {
        name: name.trim(),
        phone,
        address: address.trim(),
        note: note?.trim() ?? "",
        paymentMethod,
        tradeNo,
      },
    },
    { returnDocument: "after", runValidators: true }
  );

  if (!updatedOrder) throw new Error("ORDER_CANNOT_PAY");

  const baseParams = {
    MerchantID: merchantId,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: merchantTradeDate,
    PaymentType: "aio",
    TotalAmount: totalAmount,
    TradeDesc: "日出麵包坊",
    ItemName: itemName,
    ReturnURL: `${backendUrl}/api/payment/callback`, // 綠界付款完會 POST 回傳到這個 URL
    ClientBackURL: `${frontendUrl}/my-account`,
    ChoosePayment: paymentMethod,
    EncryptType: 1, // 1 = SHA256
    CustomField1: orderId, // 用來在 callback 時帶回訂單 ID
  } satisfies Record<string, unknown>;

  // 產生 CheckMacValue 驗證碼，防止參數被竄改。
  const checkMacValue = generateCheckValue(baseParams, hashKey, hashIv);

  return {
    params: { ...baseParams, CheckMacValue: checkMacValue },
  };
};

// 依綠界規範產生 CheckMacValue 驗證碼（綠界 ECPay 的簽章機制）
export const generateCheckValue = (
  data: Record<string, unknown>,
  hashKey = getRequiredEnv("HASH_KEY"),
  hashIv = getRequiredEnv("HASH_IV")
): string => {
  // 依 key 的字母順序排列
  const keys = Object.keys(data).sort();
  let checkValue = "";
  // 串接所有參數為 "key=value&" 格式
  for (const key of keys) checkValue += `${key}=${data[key]}&`;
  // 前後加上 HashKey 與 HashIV
  checkValue = `HashKey=${hashKey}&${checkValue}HashIV=${hashIv}`;

  checkValue = encodeURIComponent(checkValue).toLowerCase();
  checkValue = checkValue
    .replace(/%20/g, "+")
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%7e/g, "~");

  return crypto
    .createHash("sha256")
    .update(checkValue)
    .digest("hex")
    .toUpperCase();
};

// 付款完成後的處理（用 transaction 確保「更新訂單 + 商品銷量/庫存」原子性，詳細說明見 createOrderFromItems）
export const finalizePaidOrder = async ({
  orderId,
  paymentDate,
  tradeNo,
}: FinalizePaidOrderInput): Promise<FinalizeResult> => {
  const session = await mongoose.startSession(); // 開啟交易 session

  try {
    return await session.withTransaction(async () => {
      // 在交易內重新讀取訂單，確保拿到最新狀態（避免 race condition）
      const order = await OrderModel.findById(orderId).session(session);

      if (!order) throw new Error("ORDER_NOT_FOUND");

      // 訂單已被處理過（非 unpaid），直接回傳不重複更新
      if (order.paymentStatus !== "unpaid")
        return { status: "already-processed" };

      // 延遲付款：自動取消 job 可能已先取消訂單，或付款 callback 晚於 expiresAt。
      const wasCanceled = order.status === "canceled";
      const expiredBeforePayment = Boolean(
        order.expiresAt && paymentDate > order.expiresAt
      );
      const isLatePayment = wasCanceled || expiredBeforePayment;

      if (
        !isLatePayment &&
        (order.status !== "created" || order.shippingStatus !== "pending")
      )
        return { status: "already-processed" };

      // 正常付款累加銷量；尚未被取消的過期付款則回補庫存。
      let quantityUpdateField: "countInStock" | "salesCount" | null = null;
      if (!wasCanceled) {
        if (isLatePayment) quantityUpdateField = "countInStock";
        else quantityUpdateField = "salesCount";
      }

      if (order.orderItems.length > 0 && quantityUpdateField !== null) {
        const quantityByProductId = aggregateOrderItemQuantities(
          order.orderItems
        );

        const bulkOps =
          quantityUpdateField === "countInStock"
            ? [...quantityByProductId.entries()].map(
                ([productId, quantity]) => ({
                  updateOne: {
                    filter: { _id: productId },
                    update: { $inc: { countInStock: quantity } },
                  },
                })
              )
            : [...quantityByProductId.entries()].map(
                ([productId, quantity]) => ({
                  updateOne: {
                    filter: { _id: productId },
                    update: { $inc: { salesCount: quantity } },
                  },
                })
              );

        const bulkResult = await ProductModel.bulkWrite(bulkOps, { session });
        // 若 matchedCount 與 quantityByProductId.size 不相等，表示有商品不存在。
        if (bulkResult.matchedCount !== quantityByProductId.size)
          throw new Error("PRODUCT_NOT_FOUND");
      }

      order.status = isLatePayment ? "canceled" : "paid";
      order.paymentStatus = "paid";
      if (isLatePayment) {
        order.shippingStatus = "canceled";
        // 怕使用者在最後一刻付款或網路延遲，導致付款時間晚於訂單到期時間，仍視為 isLatePayment。
        order.refundStatus = "pending";
      } else {
        order.refundStatus = "not_required";
      }
      order.paymentDate = paymentDate;
      if (tradeNo) order.tradeNo = tradeNo;

      await order.save({ session });

      return { status: isLatePayment ? "late-payment-recorded" : "paid" };
    });
  } finally {
    await session.endSession();
  }
};
