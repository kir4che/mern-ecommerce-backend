import { Request, Response } from "express";
import { Types } from "mongoose";
import {
  createProduct,
  deleteProduct,
  findProductById,
  findProductsByIds,
  listProducts,
  updateProduct,
} from "../services/product.service";

const getProducts = async (req: Request, res: Response) =>
  res.status(200).json({
    success: true,
    ...(await listProducts(req.query as Record<string, unknown>)),
  });
const getProductById = async (req: Request<{ id: string }>, res: Response) => {
  const idParam = req.params.id;
  if (!idParam)
    return res.status(400).json({
      success: false,
      code: "PRODUCT_ID_REQUIRED",
      message: "Product ID is required.",
    });
  if (idParam.includes(",")) {
    const ids = idParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => Types.ObjectId.isValid(id));
    if (ids.length === 0)
      return res.status(400).json({
        success: false,
        code: "INVALID_PRODUCT_IDS",
        message: "No valid product IDs provided.",
      });
    return res
      .status(200)
      .json({ success: true, products: await findProductsByIds(ids) });
  }
  if (!Types.ObjectId.isValid(idParam))
    return res.status(400).json({
      success: false,
      code: "INVALID_PRODUCT_ID",
      message: "Invalid product ID format.",
    });
  const product = await findProductById(idParam);
  if (!product)
    return res.status(404).json({
      success: false,
      code: "PRODUCT_NOT_FOUND",
      message: "Product not found.",
    });
  return res.status(200).json({ success: true, product });
};
const addProduct = async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0)
    return res.status(400).json({
      success: false,
      code: "PRODUCT_DATA_REQUIRED",
      message: "Product data is required.",
    });
  const product = await createProduct(req.body);
  return res.status(201).json({ success: true, productId: product._id });
};
const updateProductHandler = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  const id = req.params.id;
  if (!Types.ObjectId.isValid(id))
    return res.status(400).json({
      success: false,
      code: "INVALID_PRODUCT_ID",
      message: "Invalid product ID format.",
    });
  if (!req.body || Object.keys(req.body).length === 0)
    return res.status(400).json({
      success: false,
      code: "INVALID_PRODUCT_UPDATE_DATA",
      message: "Invalid update data. Please provide data to update.",
    });
  const product = await updateProduct(id, req.body);
  if (!product)
    return res.status(404).json({
      success: false,
      code: "PRODUCT_NOT_FOUND",
      message: "Product not found.",
    });
  return res.status(200).json({ success: true, product });
};
const deleteProductById = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  const id = req.params.id;
  if (!Types.ObjectId.isValid(id))
    return res.status(400).json({
      success: false,
      code: "INVALID_PRODUCT_ID",
      message: "Invalid product ID format.",
    });
  try {
    const product = await deleteProduct(id);
    if (!product)
      return res.status(404).json({
        success: false,
        code: "PRODUCT_NOT_FOUND",
        message: "Product not found.",
      });
    return res.status(204).send();
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "PRODUCT_REFERENCED")
      return res.status(409).json({
        success: false,
        code: "PRODUCT_REFERENCED",
        message: "Product cannot be deleted while referenced by an order.",
      });
    throw err;
  }
};
export {
  addProduct,
  deleteProductById,
  getProductById,
  getProducts,
  updateProductHandler as updateProduct,
};
