import { Router } from "express";

import {
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategories,
  updateCategory,
} from "../controllers/category.controller";
import { authMiddleware, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

// 前台：取得啟用的分類（無需登入）
router.route("/").get(getCategories);

// 管理員：取得所有分類
router.use(authMiddleware);
router.route("/all").get(isAdmin, getAllCategories);

// 管理員：新增分類
router.route("/").post(isAdmin, createCategory);

// 管理員：更新/刪除分類
router
  .route("/:id")
  .patch(isAdmin, updateCategory)
  .delete(isAdmin, deleteCategory);

export { router as categoryRouter };
