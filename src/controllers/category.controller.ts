import { Request, Response } from "express";
import {
  createCategory as createCategoryService,
  deleteCategory as deleteCategoryService,
  listActiveCategories,
  listAllCategories,
  updateCategory as updateCategoryService,
} from "../services/category.service";

const getCategories = async (_req: Request, res: Response) =>
  res
    .status(200)
    .json({ success: true, categories: await listActiveCategories() });
const getAllCategories = async (_req: Request, res: Response) =>
  res
    .status(200)
    .json({ success: true, categories: await listAllCategories() });

const createCategory = async (req: Request, res: Response) => {
  const { name, slug, imageUrl, isActive = true, sortOrder = 0 } = req.body;
  if (!name || !slug)
    return res.status(400).json({
      success: false,
      code: "CATEGORY_FIELDS_REQUIRED",
      message: "name and slug are required.",
    });
  try {
    return res.status(201).json({
      success: true,
      category: await createCategoryService({
        name,
        slug,
        imageUrl,
        isActive,
        sortOrder,
      }),
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
        code: "CATEGORY_SLUG_EXISTS",
        message: "Category slug already exists.",
      });
    throw err;
  }
};

const updateCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, slug, imageUrl, isActive, sortOrder } = req.body;
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (slug !== undefined) updateData.slug = slug.toLowerCase().trim();
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
  if (Object.keys(updateData).length === 0)
    return res.status(400).json({
      success: false,
      code: "NO_UPDATE_DATA",
      message: "No fields to update.",
    });
  try {
    const category = await updateCategoryService(String(id), updateData);
    if (!category)
      return res.status(404).json({
        success: false,
        code: "CATEGORY_NOT_FOUND",
        message: "Category not found.",
      });
    return res.status(200).json({ success: true, category });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "INVALID_CATEGORY_ID")
      return res.status(400).json({
        success: false,
        code: "INVALID_CATEGORY_ID",
        message: "Invalid category ID format.",
      });
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 11000
    )
      return res.status(409).json({
        success: false,
        code: "CATEGORY_SLUG_EXISTS",
        message: "Category slug already exists.",
      });
    throw err;
  }
};

const deleteCategory = async (req: Request, res: Response) => {
  try {
    const category = await deleteCategoryService(String(req.params.id));
    if (!category)
      return res.status(404).json({
        success: false,
        code: "CATEGORY_NOT_FOUND",
        message: "Category not found.",
      });
    return res.status(204).send();
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "INVALID_CATEGORY_ID")
      return res.status(400).json({
        success: false,
        code: "INVALID_CATEGORY_ID",
        message: "Invalid category ID format.",
      });
    throw err;
  }
};

export {
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategories,
  updateCategory,
};
