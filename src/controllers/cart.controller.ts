import { Request, Response } from "express";
import { Types } from "mongoose";
import {
  addCartItemCapped,
  buildCartResponsePayload,
  clearUserCart,
  ensureCartForUser,
  findCartByUser,
  findProductForCart,
  findProductsForCart,
  removeCartItem,
  updateCartItemQuantity,
  type ICartResponsePayload,
} from "../services/cart.service";

const sendCartResponse = (
  res: Response,
  {
    code,
    message,
    payload,
  }: { code: string; message?: string; payload: ICartResponsePayload }
) =>
  res.status(200).json({
    success: true,
    code,
    ...(message ? { message } : {}),
    cart: payload.cart,
    removedInvalidCount: payload.removedInvalidCount,
    overLimitAdjustedCount: payload.overLimitAdjustedCount,
  });
const userId = (req: Request) => req.userId!;
const invalidQuantity = (quantity: unknown) =>
  typeof quantity !== "number" || quantity < 1 || !Number.isInteger(quantity);

const getCart = async (req: Request, res: Response) => {
  const cart = await findCartByUser(userId(req));
  const payload = cart
    ? await buildCartResponsePayload(userId(req), cart.items)
    : { cart: [], removedInvalidCount: 0, overLimitAdjustedCount: 0 };
  return sendCartResponse(res, {
    code: "CART_FETCHED",
    message: "Cart fetched successfully!",
    payload,
  });
};

const syncLocalCart = async (req: Request, res: Response) => {
  const { localCart } = req.body;
  if (!Array.isArray(localCart))
    return res.status(400).json({
      success: false,
      code: "INVALID_LOCAL_CART_DATA",
      message: "Invalid local cart data.",
    });
  // 逐筆檢查 local cart 的 productId 與 quantity 是否有效
  for (const item of localCart)
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.productId !== "string" ||
      !Types.ObjectId.isValid(item.productId) ||
      invalidQuantity(item.quantity)
    )
      return res.status(400).json({
        success: false,
        code: "INVALID_LOCAL_CART_ITEM",
        message: "Local cart contains invalid productId or quantity.",
      });
  let cart = await ensureCartForUser(userId(req));
  // 先把 local cart 裡有出現的商品一次查出來
  const productIds = [...new Set(localCart.map((item) => item.productId))];
  const products = await findProductsForCart(productIds);
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));
  for (const localItem of localCart) {
    const product = productMap.get(localItem.productId);
    if (!product || product.countInStock < 1) continue;
    cart = await addCartItemCapped({
      userId: userId(req),
      productId: new Types.ObjectId(localItem.productId),
      quantity: localItem.quantity,
      stock: product.countInStock,
    });
  }
  return sendCartResponse(res, {
    code: "CART_SYNCED",
    payload: await buildCartResponsePayload(userId(req), cart.items),
  });
};

const addToCart = async (req: Request, res: Response) => {
  const { productId, quantity } = req.body;
  if (!productId || quantity === undefined || quantity === null)
    return res.status(400).json({
      success: false,
      code: "CART_ITEM_FIELDS_REQUIRED",
      message: "Please provide all fields.",
    });
  if (!Types.ObjectId.isValid(productId))
    return res.status(400).json({
      success: false,
      code: "INVALID_PRODUCT_ID",
      message: "Invalid product ID format.",
    });
  if (invalidQuantity(quantity))
    return res.status(400).json({
      success: false,
      code: "INVALID_QUANTITY",
      message: "Quantity must be a positive integer.",
    });
  const product = await findProductForCart(new Types.ObjectId(productId));
  if (!product)
    return res.status(404).json({
      success: false,
      code: "PRODUCT_NOT_FOUND",
      message: "Product not found.",
    });
  if (product.countInStock < 1)
    return res.status(400).json({
      success: false,
      code: "PRODUCT_OUT_OF_STOCK",
      message: "Product is out of stock.",
    });
  const cart = await addCartItemCapped({
    userId: userId(req),
    productId: new Types.ObjectId(productId),
    quantity,
    stock: product.countInStock,
  });
  return sendCartResponse(res, {
    code: "ITEM_ADDED",
    payload: await buildCartResponsePayload(userId(req), cart.items),
  });
};

const removeFromCart = async (req: Request, res: Response) => {
  const productId = String(req.params.productId);
  if (!Types.ObjectId.isValid(productId))
    return res.status(400).json({
      success: false,
      code: "INVALID_PRODUCT_ID",
      message: "Invalid product ID format.",
    });
  const cart = await removeCartItem(userId(req), new Types.ObjectId(productId));
  if (!cart)
    return res.status(404).json({
      success: false,
      code: "CART_ITEM_NOT_FOUND",
      message: "Item not found in your cart.",
    });
  return sendCartResponse(res, {
    code: "CART_ITEM_REMOVED",
    message: "Selected item removed successfully!",
    payload: await buildCartResponsePayload(userId(req), cart.items),
  });
};

const changeQuantity = async (req: Request, res: Response) => {
  const productId = String(req.params.productId);
  const { quantity } = req.body;
  if (!Types.ObjectId.isValid(productId))
    return res.status(400).json({
      success: false,
      code: "INVALID_PRODUCT_ID",
      message: "Invalid product ID format.",
    });
  if (invalidQuantity(quantity))
    return res.status(400).json({
      success: false,
      code: "INVALID_QUANTITY",
      message: "Quantity must be a positive integer.",
    });
  const product = await findProductForCart(new Types.ObjectId(productId));
  if (!product)
    return res.status(404).json({
      success: false,
      code: "PRODUCT_NOT_FOUND",
      message: "Product not found.",
    });
  const stock = Number(product.countInStock ?? 0);
  if (stock < 1)
    return res.status(400).json({
      success: false,
      code: "PRODUCT_OUT_OF_STOCK",
      message: "Product is out of stock.",
    });
  const cart = await updateCartItemQuantity(
    userId(req),
    new Types.ObjectId(productId),
    Math.min(quantity, stock)
  );
  if (!cart)
    return res.status(404).json({
      success: false,
      code: "CART_ITEM_NOT_FOUND",
      message: "Item not found in your cart.",
    });
  return sendCartResponse(res, {
    code: "CART_UPDATED",
    message: "Cart updated successfully!",
    payload: await buildCartResponsePayload(userId(req), cart.items),
  });
};

const clearCart = async (req: Request, res: Response) => {
  const cart = await clearUserCart(userId(req));
  if (!cart)
    return res.status(404).json({
      success: false,
      code: "CART_NOT_FOUND",
      message: "Cart not found.",
    });
  return sendCartResponse(res, {
    code: "CART_CLEARED",
    message: "Cart cleared successfully!",
    payload: await buildCartResponsePayload(userId(req), cart.items),
  });
};
export {
  addToCart,
  changeQuantity,
  clearCart,
  getCart,
  removeFromCart,
  syncLocalCart,
};
