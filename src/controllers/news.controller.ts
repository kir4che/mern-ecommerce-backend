import { Request, Response } from "express";
import {
  createNews,
  deleteNews,
  getNewsById,
  listNews,
  updateNews,
} from "../services/news.service";

const getNew = async (req: Request, res: Response) => {
  const result = await listNews(req.query.page, req.query.limit);
  return res.status(200).json({
    success: true,
    news: result.news,
    total: result.total,
    limit: result.limit,
    page: result.page,
    totalPages: result.pages,
  });
};
const getNewById = async (req: Request, res: Response) => {
  try {
    const newsItem = await getNewsById(String(req.params.id));
    if (!newsItem)
      return res.status(404).json({
        success: false,
        code: "NEWS_NOT_FOUND",
        message: "News not found.",
      });
    return res.status(200).json({ success: true, newsItem });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "INVALID_NEWS_ID")
      return res.status(400).json({
        success: false,
        code: "INVALID_NEWS_ID",
        message: "Invalid news ID format.",
      });
    throw err;
  }
};
const addNew = async (req: Request, res: Response) => {
  await createNews(req.body);
  return res.status(201).json({ success: true });
};
const updateNew = async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0)
    return res.status(400).json({
      success: false,
      code: "INVALID_NEWS_UPDATE_DATA",
      message: "Invalid update data. Please provide data to update.",
    });
  try {
    const news = await updateNews(String(req.params.id), req.body);
    if (!news)
      return res.status(404).json({
        success: false,
        code: "NEWS_NOT_FOUND",
        message: "News not found.",
      });
    return res.status(200).json({
      success: true,
      code: "NEWS_UPDATED",
      message: "News updated successfully!",
      news,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "INVALID_NEWS_ID")
      return res.status(400).json({
        success: false,
        code: "INVALID_NEWS_ID",
        message: "Invalid news ID format.",
      });
    throw err;
  }
};
const deleteNewById = async (req: Request, res: Response) => {
  try {
    const news = await deleteNews(String(req.params.id));
    if (!news)
      return res.status(404).json({
        success: false,
        code: "NEWS_NOT_FOUND",
        message: "News not found.",
      });
    return res.status(204).send();
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "INVALID_NEWS_ID")
      return res.status(400).json({
        success: false,
        code: "INVALID_NEWS_ID",
        message: "Invalid news ID format.",
      });
    throw err;
  }
};
export { addNew, deleteNewById, getNew, getNewById, updateNew };
