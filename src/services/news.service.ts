import { Types } from "mongoose";

import { NewsModel } from "../models/news.model";
import { parsePositiveInt } from "../utils/number";

export const listNews = (pageInput: unknown, limitInput: unknown) => {
  const page = parsePositiveInt(pageInput, 1);
  const limit = parsePositiveInt(limitInput, 10, 100);
  return Promise.all([
    NewsModel.countDocuments(),
    NewsModel.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]).then(([total, news]) => ({
    news,
    total,
    limit,
    page,
    pages: Math.ceil(total / limit),
  }));
};

export const getNewsById = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new Error("INVALID_NEWS_ID");
  return NewsModel.findById(id).lean();
};

export const createNews = (data: Record<string, unknown>) => {
  const news = new NewsModel(data);
  return news.save();
};

export const updateNews = (id: string, data: Record<string, unknown>) => {
  if (!Types.ObjectId.isValid(id)) throw new Error("INVALID_NEWS_ID");
  return NewsModel.findByIdAndUpdate(
    id,
    { $set: data },
    { returnDocument: "after", runValidators: true }
  );
};

export const deleteNews = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new Error("INVALID_NEWS_ID");
  return NewsModel.findByIdAndDelete(id);
};
