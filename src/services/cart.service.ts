import { Types } from "mongoose";

import { CartModel, ICartItem } from "../models/cart.model";
import { ProductModel } from "../models/product.model";

interface ICartProduct {
  title: string;
  price: number;
  imageUrl: string;
  countInStock?: number;
}

interface ICartResponseItem {
  productId: ICartItem["productId"];
  quantity: number;
  product: ICartProduct;
}

export interface ICartResponsePayload {
  cart: ICartResponseItem[];
  removedInvalidCount: number;
  overLimitAdjustedCount: number;
}

interface AddCartItemOptions {
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  quantity: number;
  stock: number;
}

export const findCartByUser = (userId: Types.ObjectId) =>
  CartModel.findOne({ userId });

export const ensureCartForUser = (userId: Types.ObjectId) =>
  CartModel.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, items: [] } },
    { returnDocument: "after", upsert: true }
  );

export const findProductForCart = (productId: Types.ObjectId) =>
  ProductModel.findById(productId);

export const findProductsForCart = (productIds: string[]) =>
  ProductModel.find({ _id: { $in: productIds } });

export const removeCartItem = (
  userId: Types.ObjectId,
  productId: Types.ObjectId
) =>
  CartModel.findOneAndUpdate(
    { userId, "items.productId": productId },
    { $pull: { items: { productId } } },
    { returnDocument: "after" }
  );

export const updateCartItemQuantity = (
  userId: Types.ObjectId,
  productId: Types.ObjectId,
  quantity: number
) =>
  CartModel.findOneAndUpdate(
    { userId, "items.productId": productId },
    { $set: { "items.$.quantity": quantity } },
    { returnDocument: "after" }
  );

export const clearUserCart = (userId: Types.ObjectId) =>
  CartModel.findOneAndUpdate(
    { userId },
    { $set: { items: [] } },
    { returnDocument: "after" }
  );

// 依據購物車品項，回傳可用的商品資訊，並移除不存在的商品、調整超過庫存的數量。
export const buildCartResponsePayload = async (
  userId: Types.ObjectId,
  items: readonly ICartItem[]
): Promise<ICartResponsePayload> => {
  if (!items.length)
    return { cart: [], removedInvalidCount: 0, overLimitAdjustedCount: 0 };

  const productIds = [
    ...new Set(items.map((item) => item.productId.toString())),
  ];
  const products = await ProductModel.find(
    { _id: { $in: productIds } },
    "title price imageUrl countInStock"
  );
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  const cart: ICartResponseItem[] = [];
  const normalizedItems: ICartItem[] = [];
  let removedInvalidCount = 0; // 因商品不存在或已下架而被移除的計數
  let overLimitAdjustedCount = 0; // 因超過庫存而被調整數量的計數

  for (const item of items) {
    const product = productMap.get(item.productId.toString());

    if (!product) {
      removedInvalidCount++;
      continue;
    }

    const stock = product.countInStock ?? 0;
    if (stock < 1) {
      normalizedItems.push({
        productId: item.productId,
        quantity: item.quantity,
      });
      cart.push({
        productId: item.productId,
        quantity: item.quantity,
        product: {
          title: product.title,
          price: product.price,
          imageUrl: product.imageUrl,
          countInStock: product.countInStock,
        },
      });
      continue;
    }

    const quantity = Math.min(item.quantity, stock);

    if (quantity !== item.quantity) overLimitAdjustedCount++;

    normalizedItems.push({ productId: item.productId, quantity });

    cart.push({
      productId: item.productId,
      quantity,
      product: {
        title: product.title,
        price: product.price,
        imageUrl: product.imageUrl,
        countInStock: product.countInStock,
      },
    });
  }

  if (
    normalizedItems.length !== items.length ||
    normalizedItems.some(
      (item, index) =>
        item.productId.toString() !== items[index]?.productId.toString() ||
        item.quantity !== items[index]?.quantity
    )
  ) {
    await CartModel.updateOne({ userId }, { $set: { items: normalizedItems } });
  }

  return { cart, removedInvalidCount, overLimitAdjustedCount };
};

// 購物車新增商品，若已存在則累加數量。
export const addCartItemCapped = async ({
  userId,
  productId,
  quantity,
  stock,
}: AddCartItemOptions) => {
  const cart =
    (await CartModel.findOne({ userId })) ??
    new CartModel({ userId, items: [] });
  const existingItem = cart.items.find((item) =>
    item.productId.equals(productId)
  );

  if (existingItem)
    existingItem.quantity = Math.min(existingItem.quantity + quantity, stock);
  else cart.items.push({ productId, quantity: Math.min(quantity, stock) });

  await cart.save();
  return cart;
};
