import { Types } from "mongoose";

import { TagModel } from "../models/tag.model";

export const listActiveTags = () =>
  TagModel.find({ isActive: true }).sort({ name: 1 }).lean();

export const listAllTags = () => TagModel.find().sort({ createdAt: -1 }).lean();

export const createTag = (input: {
  name: string;
  slug: string;
  isActive?: boolean;
}) =>
  TagModel.create({
    name: input.name,
    slug: input.slug.toLowerCase().trim(),
    isActive: input.isActive ?? true,
  });

export const updateTag = (id: string, updateData: Record<string, unknown>) => {
  if (!Types.ObjectId.isValid(id)) throw new Error("INVALID_TAG_ID");
  return TagModel.findByIdAndUpdate(id, updateData, {
    returnDocument: "after",
    runValidators: true,
  });
};

export const deleteTag = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new Error("INVALID_TAG_ID");
  return TagModel.findByIdAndDelete(id);
};
