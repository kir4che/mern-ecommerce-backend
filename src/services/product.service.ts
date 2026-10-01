import { Types } from "mongoose";

import { OrderModel } from "../models/order.model";
import { ProductModel } from "../models/product.model";
import { parsePositiveInt } from "../utils/number";
import { escapeRegex } from "../utils/regex";

const ALLOWED_SORT_FIELDS = [
  "title",
  "price",
  "countInStock",
  "salesCount",
  "createdAt",
] as const;

export const listProducts = (query: Record<string, unknown>) => {
  const filter: Record<string, unknown> = {};
  // 分類篩選
  if (query.category && query.category !== "all")
    filter.categories = query.category;
  // 標籤篩選
  if (query.tag) filter.tags = query.tag;
  // 關鍵字篩選
  if (query.search)
    filter.title = {
      $regex: escapeRegex(query.search as string),
      $options: "i",
    };
  const total = ProductModel.countDocuments(filter);
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, 10, 100);
  const sortBy = query.sortBy as string | undefined;
  const order = query.order as string | undefined;
  const sortOption: Record<string, 1 | -1> =
    sortBy &&
    ALLOWED_SORT_FIELDS.includes(sortBy as (typeof ALLOWED_SORT_FIELDS)[number])
      ? { [sortBy]: order === "asc" ? 1 : -1 }
      : { createdAt: -1 };
  return Promise.all([
    total,
    ProductModel.find(filter)
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]).then(([totalCount, products]) => ({
    products,
    total: totalCount,
    pages: Math.ceil(totalCount / limit) || 1,
    page,
  }));
};

export const findProductsByIds = (ids: string[]) =>
  ProductModel.find({ _id: { $in: ids } })
    .sort({ createdAt: -1 })
    .lean();
export const findProductById = (id: string) => ProductModel.findById(id).lean();
export const createProduct = (data: Record<string, unknown>) =>
  new ProductModel(data).save();
export const updateProduct = (id: string, data: Record<string, unknown>) =>
  ProductModel.findByIdAndUpdate(
    id,
    { $set: data },
    { returnDocument: "after", runValidators: true }
  );

export const deleteProduct = async (productId: string) => {
  const targetProductId = new Types.ObjectId(productId);
  const session = await ProductModel.startSession(); // 開啟交易 session
  try {
    // 用 transaction 確保「檢查訂單引用 + 刪除商品」原子性（詳細說明見 createOrderFromItems）
    return await session.withTransaction(async () => {
      const referencedOrder = await OrderModel.exists({
        "orderItems.productId": targetProductId,
      }).session(session);
      // 若有訂單使用到該商品，則不允許刪除。
      if (referencedOrder) throw new Error("PRODUCT_REFERENCED");
      return ProductModel.findOneAndDelete({ _id: productId }).session(session);
    });
  } finally {
    await session.endSession();
  }
};
