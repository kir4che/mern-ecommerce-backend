import { Document, Schema, model } from "mongoose";

export const DISCOUNT_TYPES = ["percentage", "fixed"] as const;

export interface ICoupon extends Document {
  code: string;
  discountType: (typeof DISCOUNT_TYPES)[number];
  discountValue: number;
  expiryDate: Date;
  isActive: boolean;
  minPurchaseAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    discountType: {
      type: String,
      enum: DISCOUNT_TYPES,
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0.01,
    },
    expiryDate: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    minPurchaseAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

couponSchema.index({ isActive: 1, expiryDate: 1 });

export const CouponModel = model<ICoupon>("Coupon", couponSchema);
