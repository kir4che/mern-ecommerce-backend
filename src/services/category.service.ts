import { Types } from "mongoose";

import { CategoryModel } from "../models/category.model";
import { ProductModel } from "../models/product.model";

export interface CategoryInput {
  name: string;
  slug: string;
  imageUrl?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export const listActiveCategories = async () => {
  const categories = await CategoryModel.find({ isActive: true })
    .sort({ name: 1 })
    .lean();

  // 為商品分類加上其擁有的商品數量
  return Promise.all(
    categories.map(async (category) => ({
      ...category,
      productCount: await ProductModel.countDocuments({
        categories: category.slug,
      }),
    }))
  );
};

export const listAllCategories = () =>
  CategoryModel.find().sort({ sortOrder: 1, name: 1 }).lean();

export const createCategory = (input: CategoryInput) =>
  CategoryModel.create({
    ...input,
    slug: input.slug.toLowerCase().trim(),
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
  });

export const updateCategory = (
  id: string,
  updateData: Record<string, unknown>
) => {
  if (!Types.ObjectId.isValid(id)) throw new Error("INVALID_CATEGORY_ID");
  return CategoryModel.findByIdAndUpdate(id, updateData, {
    returnDocument: "after",
    runValidators: true,
  });
};

export const deleteCategory = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new Error("INVALID_CATEGORY_ID");
  return CategoryModel.findByIdAndDelete(id);
};
