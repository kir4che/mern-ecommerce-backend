import type { ICoupon } from "../models/coupon.model";

type CouponValidationSuccess = {
  valid: true;
  type: ICoupon["discountType"];
  value: number;
  discountAmount: number;
};

type CouponValidationFailure = {
  valid: false;
  code: string;
  message: string;
};

type CouponValidationResult = CouponValidationSuccess | CouponValidationFailure;

type DiscountValidation = {
  valid: boolean;
  error?: string;
};

// 將優惠碼去除空白並轉成大寫
export const normalizeCouponCode = (code: string) => code.trim().toUpperCase();

// 驗證折扣數值是否合法
export const validateDiscountValue = (
  type: string,
  value: number
): DiscountValidation => {
  if (value <= 0)
    return { valid: false, error: "Discount value must be greater than 0." };

  if (type === "percentage" && value > 100)
    return {
      valid: false,
      error: "Percentage discount cannot exceed 100.",
    };

  return { valid: true };
};

// 計算折扣金額
const getDiscountAmount = (coupon: ICoupon, subtotal: number) => {
  if (coupon.discountType === "percentage")
    return Math.round(subtotal * (coupon.discountValue / 100));

  return Math.round(coupon.discountValue);
};

// 驗證優惠碼是否可用於當前訂單金額
export const validateCouponForSubtotal = (
  coupon: ICoupon | null,
  subtotal: number,
  now = new Date() // 預設使用當前時間
): CouponValidationResult => {
  if (!coupon)
    return {
      valid: false,
      code: "COUPON_NOT_FOUND",
      message: "Coupon not found.",
    };

  if (!coupon.isActive)
    return {
      valid: false,
      code: "COUPON_NOT_ACTIVE",
      message: "This coupon is currently inactive.",
    };

  if (coupon.expiryDate.getTime() < now.getTime())
    return {
      valid: false,
      code: "COUPON_EXPIRED",
      message: "Coupon has expired.",
    };

  if (subtotal < coupon.minPurchaseAmount)
    return {
      valid: false,
      code: "COUPON_MIN_PURCHASE_NOT_MET",
      message: `Coupon requires a minimum purchase of NT$${coupon.minPurchaseAmount}.`,
    };

  // 計算折扣金額，並確保不會超過訂單金額。
  const discountAmount = Math.min(
    getDiscountAmount(coupon, subtotal),
    subtotal
  );

  if (discountAmount <= 0)
    return {
      valid: false,
      code: "INVALID_COUPON_DISCOUNT_AMOUNT",
      message: "Coupon discount amount is invalid.",
    };
  return {
    valid: true,
    type: coupon.discountType,
    value: coupon.discountValue,
    discountAmount,
  };
};
