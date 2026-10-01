import { Request, Response } from "express";
import {
  createTag as createTagService,
  deleteTag as deleteTagService,
  listActiveTags,
  listAllTags,
  updateTag as updateTagService,
} from "../services/tag.service";

const getTags = async (_req: Request, res: Response) =>
  res.status(200).json({ success: true, tags: await listActiveTags() });
const getAllTags = async (_req: Request, res: Response) =>
  res.status(200).json({ success: true, tags: await listAllTags() });
const createTag = async (req: Request, res: Response) => {
  const { name, slug, isActive = true } = req.body;
  if (!name || !slug)
    return res.status(400).json({
      success: false,
      code: "TAG_FIELDS_REQUIRED",
      message: "name and slug are required.",
    });
  try {
    return res.status(201).json({
      success: true,
      tag: await createTagService({ name, slug, isActive }),
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
        code: "TAG_SLUG_EXISTS",
        message: "Tag slug already exists.",
      });
    throw err;
  }
};
const updateTag = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, slug, isActive } = req.body;
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (slug !== undefined) updateData.slug = slug.toLowerCase().trim();
  if (isActive !== undefined) updateData.isActive = isActive;
  if (Object.keys(updateData).length === 0)
    return res.status(400).json({
      success: false,
      code: "NO_UPDATE_DATA",
      message: "No fields to update.",
    });
  try {
    const tag = await updateTagService(String(id), updateData);
    if (!tag)
      return res.status(404).json({
        success: false,
        code: "TAG_NOT_FOUND",
        message: "Tag not found.",
      });
    return res.status(200).json({ success: true, tag });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "INVALID_TAG_ID")
      return res.status(400).json({
        success: false,
        code: "INVALID_TAG_ID",
        message: "Invalid tag ID format.",
      });
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 11000
    )
      return res.status(409).json({
        success: false,
        code: "TAG_SLUG_EXISTS",
        message: "Tag slug already exists.",
      });
    throw err;
  }
};
const deleteTag = async (req: Request, res: Response) => {
  try {
    const tag = await deleteTagService(String(req.params.id));
    if (!tag)
      return res.status(404).json({
        success: false,
        code: "TAG_NOT_FOUND",
        message: "Tag not found.",
      });
    return res.status(204).send();
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "INVALID_TAG_ID")
      return res.status(400).json({
        success: false,
        code: "INVALID_TAG_ID",
        message: "Invalid tag ID format.",
      });
    throw err;
  }
};
export { createTag, deleteTag, getAllTags, getTags, updateTag };
