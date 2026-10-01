import { Request, Response } from "express";
import { Types } from "mongoose";

import {
  DISCOUNT_TYPES,
  createCouponRecord,
  deleteCouponRecord,
  findCouponByCode,
  findCouponById,
  listActiveCoupons,
  listCoupons,
  updateCouponRecord,
} from "../services/coupon.service";
import {
  normalizeCouponCode,
  validateCouponForSubtotal,
  validateDiscountValue,
} from "../utils/coupon";

type CreateCouponRequestBody = {
  code?: string;
  discountType?: string;
  discountValue?: number;
  expiryDate?: string;
  isActive?: boolean;
  minPurchaseAmount?: number;
};

type CouponRequestBody = {
  code?: string;
  subtotal?: number;
};

const getCoupons = async (_req: Request, res: Response) => {
  const coupons = await listCoupons();
  return res.status(200).json({ success: true, coupons });
};

const createCoupon = async (
  req: Request<unknown, unknown, CreateCouponRequestBody>,
  res: Response
) => {
  const {
    code,
    discountType,
    discountValue,
    expiryDate,
    isActive = true,
    minPurchaseAmount = 0,
  } = req.body;

  if (
    !code ||
    !discountType ||
    typeof discountValue !== "number" ||
    !expiryDate
  )
    return res.status(400).json({
      success: false,
      code: "COUPON_FIELDS_REQUIRED",
      message:
        "code, discountType, discountValue, and expiryDate are required.",
    });

  if (!DISCOUNT_TYPES.includes(discountType as (typeof DISCOUNT_TYPES)[number]))
    return res.status(400).json({
      success: false,
      code: "INVALID_DISCOUNT_TYPE",
      message: "discountType must be either percentage or fixed.",
    });

  const discountValidation = validateDiscountValue(discountType, discountValue);

  if (!discountValidation.valid)
    return res.status(400).json({
      success: false,
      code: "INVALID_DISCOUNT_VALUE",
      message: discountValidation.error,
    });

  if (minPurchaseAmount < 0)
    return res.status(400).json({
      success: false,
      code: "INVALID_MIN_PURCHASE_AMOUNT",
      message: "minPurchaseAmount cannot be less than 0.",
    });

  const parsedExpiryDate = new Date(expiryDate);

  if (Number.isNaN(parsedExpiryDate.getTime()))
    return res.status(400).json({
      success: false,
      code: "INVALID_EXPIRY_DATE",
      message: "expiryDate format is invalid.",
    });

  try {
    const coupon = await createCouponRecord({
      code: normalizeCouponCode(code),
      discountType: discountType as (typeof DISCOUNT_TYPES)[number],
      discountValue,
      expiryDate: parsedExpiryDate,
      isActive,
      minPurchaseAmount,
    });

    return res.status(201).json({ success: true, coupon });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 11000
    )
      return res.status(409).json({
        success: false,
        code: "COUPON_CODE_ALREADY_EXISTS",
        message: "Coupon code already exists.",
      });

    throw err;
  }
};

const updateCouponById = async (
  req: Request<{ id: string }, unknown, CreateCouponRequestBody>,
  res: Response
) => {
  const { id } = req.params;

  if (!Types.ObjectId.isValid(id))
    return res.status(400).json({
      success: false,
      code: "INVALID_COUPON_ID",
      message: "Invalid coupon ID format.",
    });

  const {
    code,
    discountType,
    discountValue,
    expiryDate,
    isActive,
    minPurchaseAmount,
  } = req.body;

  if (
    discountType &&
    !DISCOUNT_TYPES.includes(discountType as (typeof DISCOUNT_TYPES)[number])
  )
    return res.status(400).json({
      success: false,
      code: "INVALID_DISCOUNT_TYPE",
      message: "discountType must be either percentage or fixed.",
    });

  if (discountValue !== undefined && typeof discountValue !== "number") {
    return res.status(400).json({
      success: false,
      code: "INVALID_DISCOUNT_VALUE",
      message: "Discount value must be a number.",
    });
  }

  if (discountValue !== undefined) {
    const discountValidation = validateDiscountValue(
      discountType || "fixed",
      discountValue
    );
    if (!discountValidation.valid)
      return res.status(400).json({
        success: false,
        code: "INVALID_DISCOUNT_VALUE",
        message: discountValidation.error,
      });
  }

  if (minPurchaseAmount !== undefined && minPurchaseAmount < 0)
    return res.status(400).json({
      success: false,
      code: "INVALID_MIN_PURCHASE_AMOUNT",
      message: "minPurchaseAmount cannot be less than 0.",
    });

  if (expiryDate !== undefined) {
    const parsedExpiryDate = new Date(expiryDate);

    if (Number.isNaN(parsedExpiryDate.getTime()))
      return res.status(400).json({
        success: false,
        code: "INVALID_EXPIRY_DATE",
        message: "expiryDate format is invalid.",
      });
  }

  try {
    const existingCoupon = await findCouponById(id);

    if (!existingCoupon)
      return res.status(404).json({
        success: false,
        code: "COUPON_NOT_FOUND",
        message: "Coupon not found.",
      });

    // 合併後再次驗證（避免 percentage > 100）
    if (
      discountType === "percentage" ||
      existingCoupon.discountType === "percentage"
    ) {
      const finalDiscountType = discountType ?? existingCoupon.discountType; // 最終折扣類型
      const finalDiscountValue = discountValue ?? existingCoupon.discountValue; // 最終折扣值
      const validation = validateDiscountValue(
        finalDiscountType,
        finalDiscountValue
      );

      if (!validation.valid)
        return res.status(400).json({
          success: false,
          code: "INVALID_DISCOUNT_VALUE",
          message: validation.error,
        });
    }

    const updateData: Partial<{
      code: string;
      discountType: string;
      discountValue: number;
      expiryDate: Date;
      isActive: boolean;
      minPurchaseAmount: number;
    }> = {};

    if (code !== undefined) updateData.code = normalizeCouponCode(code);
    if (discountType !== undefined)
      updateData.discountType = discountType as (typeof DISCOUNT_TYPES)[number];
    if (discountValue !== undefined) updateData.discountValue = discountValue;
    if (expiryDate !== undefined) updateData.expiryDate = new Date(expiryDate);
    if (isActive !== undefined) updateData.isActive = isActive;
    if (minPurchaseAmount !== undefined)
      updateData.minPurchaseAmount = minPurchaseAmount;

    const coupon = await updateCouponRecord(
      existingCoupon._id.toString(),
      updateData
    );

    return res.status(200).json({
      success: true,
      code: "COUPON_UPDATED",
      message: "Coupon has been updated.",
      coupon,
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 11000
    )
      return res.status(409).json({
        success: false,
        code: "COUPON_CODE_ALREADY_EXISTS",
        message: "Coupon code already exists.",
      });

    throw err;
  }
};

const deleteCouponById = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  const { id } = req.params;

  if (!Types.ObjectId.isValid(id))
    return res.status(400).json({
      success: false,
      code: "INVALID_COUPON_ID",
      message: "Invalid coupon ID format.",
    });

  const coupon = await deleteCouponRecord(id);

  if (!coupon)
    return res.status(404).json({
      success: false,
      code: "COUPON_NOT_FOUND",
      message: "Coupon not found.",
    });

  return res.status(204).send();
};

// 取得啟用中且未過期的優惠券
const getActiveCoupons = async (_req: Request, res: Response) => {
  const result = await listActiveCoupons();

  return res.status(200).json({ success: true, coupons: result });
};

// 驗證優惠券是否可用
const validateCoupon = async (
  req: Request<unknown, unknown, CouponRequestBody>,
  res: Response
) => {
  const { code, subtotal } = req.body;

  if (!code)
    return res.status(400).json({
      valid: false,
      code: "COUPON_CODE_REQUIRED",
      message: "Please provide a coupon code.",
    });

  if (subtotal !== undefined && (typeof subtotal !== "number" || subtotal < 0))
    return res.status(400).json({
      valid: false,
      code: "INVALID_SUBTOTAL",
      message: "subtotal must be a number greater than or equal to 0.",
    });

  const normalizedCode = normalizeCouponCode(code);
  const coupon = await findCouponByCode(normalizedCode);

  const subtotalForValidation = typeof subtotal === "number" ? subtotal : 0;

  const result = validateCouponForSubtotal(coupon, subtotalForValidation);

  if (!result.valid)
    return res.status(200).json({
      valid: false,
      code: result.code,
      message: result.message,
    });

  return res.status(200).json({
    valid: true,
    type: result.type,
    value: result.value,
    discountAmount: result.discountAmount,
    code: normalizedCode,
  });
};

export {
  createCoupon,
  deleteCouponById,
  getActiveCoupons,
  getCoupons,
  updateCouponById,
  validateCoupon,
};
