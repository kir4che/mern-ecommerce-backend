import crypto from "node:crypto";
import { Types } from "mongoose";

export interface ValidatedOrderItemInput {
  readonly productId: string;
  readonly quantity: number;
}

interface ParsedCreateOrderInput {
  readonly couponCode?: string;
  readonly idempotencyKey?: string;
  readonly orderItems: readonly ValidatedOrderItemInput[];
}

type CreateOrderInputError =
  | "INVALID_ORDER_REQUEST"
  | "ORDER_ITEMS_REQUIRED"
  | "INVALID_ORDER_ITEMS";

type CreateOrderInputParseResult =
  | { readonly ok: true; readonly value: ParsedCreateOrderInput }
  | { readonly ok: false; readonly code: CreateOrderInputError };

// 檢查值是否為純物件（非陣列、非 null）
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// 驗證單筆訂單項目：productId 必須是合法的 ObjectId，quantity 必須是正整數
const isValidOrderItemInput = (
  item: unknown
): item is ValidatedOrderItemInput => {
  if (!isRecord(item)) return false;

  return (
    typeof item.productId === "string" &&
    Types.ObjectId.isValid(item.productId) &&
    typeof item.quantity === "number" &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 1
  );
};

// 解析並驗證建立訂單的 request body
export const parseCreateOrderInput = (
  body: unknown
): CreateOrderInputParseResult => {
  if (!isRecord(body)) return { ok: false, code: "INVALID_ORDER_REQUEST" };

  const { couponCode, idempotencyKey, orderItems } = body;

  if (
    (couponCode !== undefined && typeof couponCode !== "string") ||
    (idempotencyKey !== undefined &&
      (typeof idempotencyKey !== "string" || idempotencyKey.length > 100))
  )
    return { ok: false, code: "INVALID_ORDER_REQUEST" };

  // orderItems 必須是非空陣列
  if (!Array.isArray(orderItems) || orderItems.length === 0)
    return { ok: false, code: "ORDER_ITEMS_REQUIRED" };

  // 逐筆驗證訂單項目，任一筆無效即中斷。
  const validatedItems: ValidatedOrderItemInput[] = [];
  for (const item of orderItems) {
    if (!isValidOrderItemInput(item))
      return { ok: false, code: "INVALID_ORDER_ITEMS" };

    validatedItems.push({
      productId: item.productId,
      quantity: item.quantity,
    });
  }

  return {
    ok: true,
    value: {
      couponCode: typeof couponCode === "string" ? couponCode : undefined,
      idempotencyKey:
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      orderItems: validatedItems,
    },
  };
};

// 產生訂單編號：ORD-{timestamp}-{8位hex隨機字串}
export const generateOrderNo = (): string => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString("hex");
  return `ORD-${timestamp}-${random}`;
};

// 合併相同商品的數量
export const aggregateOrderItemQuantities = (
  items: readonly {
    readonly productId: string | Types.ObjectId;
    readonly quantity: number;
  }[]
): Map<string, number> => {
  const quantities = new Map<string, number>();
  for (const { productId, quantity } of items) {
    const key = productId.toString();
    quantities.set(key, (quantities.get(key) ?? 0) + quantity);
  }

  // 回傳 Map<productId, 總數量> 用於庫存扣減與查詢
  return quantities;
};
