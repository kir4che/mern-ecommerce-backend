import { CouponModel, DISCOUNT_TYPES } from "../models/coupon.model";

export { DISCOUNT_TYPES };

const COUPON_FIELDS =
  "code discountType discountValue expiryDate isActive minPurchaseAmount createdAt updatedAt";

export const listCoupons = () =>
  CouponModel.find().select(COUPON_FIELDS).sort({ createdAt: -1 }).lean();

export const createCouponRecord = (data: Record<string, unknown>) =>
  CouponModel.create(data);

export const findCouponById = (id: string) => CouponModel.findById(id);

export const updateCouponRecord = (id: string, data: Record<string, unknown>) =>
  CouponModel.findByIdAndUpdate(id, data, {
    returnDocument: "after",
    runValidators: true,
  }).select(COUPON_FIELDS);

export const deleteCouponRecord = (id: string) =>
  CouponModel.findByIdAndDelete(id);

// 取得啟用中且未過期的優惠券
export const listActiveCoupons = async () => {
  return CouponModel.find({
    isActive: true,
    expiryDate: { $gt: new Date() },
  })
    .select(COUPON_FIELDS)
    .sort({ createdAt: -1 })
    .lean();
};

export const findCouponByCode = (code: string) =>
  CouponModel.findOne({ code }).select(COUPON_FIELDS);
