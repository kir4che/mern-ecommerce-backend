import { Document, Schema, Types, model } from "mongoose";

export const ORDER_STATUS = [
  "created",
  "paid",
  "shipped",
  "canceled",
  "completed",
  "returned",
] as const;

export const SHIPPING_STATUS = [
  "pending",
  "in_transit",
  "delivered",
  "canceled",
] as const;

export const PAYMENT_STATUS = ["unpaid", "paid"] as const;

// 退款狀態（not_required: 不需退款, pending: 退款中, refunded: 已退款）
export const REFUND_STATUS = ["not_required", "pending", "refunded"] as const;

interface IOrderItem {
  productId: Types.ObjectId;
  quantity: number;
  price: number;
  title: string;
  imageUrl?: string;
}

export interface IOrder extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  orderNo: string;
  userId: Types.ObjectId;
  name: string;
  phone: string;
  address: string;
  orderItems: IOrderItem[];
  subtotal: number;
  shippingFee: number;
  couponCode?: string;
  discount?: number; // 折扣金額
  totalAmount: number; // 最終應付金額（商品金額 + 運費 - 折扣）
  status: (typeof ORDER_STATUS)[number];
  shippingTrackingNo?: string;
  shippingStatus: (typeof SHIPPING_STATUS)[number];
  paymentMethod?: string;
  tradeNo?: string; // 綠界交易編號
  paymentStatus: (typeof PAYMENT_STATUS)[number];
  refundStatus: (typeof REFUND_STATUS)[number];
  paymentDate?: Date;
  note?: string;
  expiresAt?: Date; // 過期時間
  idempotencyKey?: string; // 防止重複下單
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  title: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  imageUrl: { type: String },
});

const orderSchema = new Schema<IOrder>(
  {
    orderNo: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String },
    phone: { type: String, match: /^09\d{8}$/ },
    address: { type: String },
    orderItems: { type: [orderItemSchema], required: true },
    couponCode: { type: String },
    subtotal: { type: Number, default: 0, required: true, min: 0 },
    shippingFee: { type: Number, default: 60, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUS, default: "created" },
    shippingTrackingNo: { type: String, unique: true, sparse: true },
    shippingStatus: { type: String, enum: SHIPPING_STATUS, default: "pending" },
    paymentMethod: { type: String },
    tradeNo: { type: String },
    paymentStatus: { type: String, enum: PAYMENT_STATUS, default: "unpaid" },
    refundStatus: {
      type: String,
      enum: REFUND_STATUS,
      default: "not_required",
    },
    paymentDate: { type: Date },
    note: { type: String, default: "" },
    expiresAt: { type: Date },
    idempotencyKey: { type: String },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true }
);
orderSchema.index(
  { tradeNo: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { paymentStatus: "paid" },
  }
);

export const OrderModel = model<IOrder>("Order", orderSchema);
