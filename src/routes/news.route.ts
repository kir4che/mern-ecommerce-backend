import { Router } from "express";

import {
  addNew,
  deleteNewById,
  getNew,
  getNewById,
  updateNew,
} from "../controllers/news.controller";
import { authMiddleware, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

router.route("/").get(getNew).post(authMiddleware, isAdmin, addNew);
router
  .route("/:id")
  .get(getNewById)
  .patch(authMiddleware, isAdmin, updateNew)
  .delete(authMiddleware, isAdmin, deleteNewById);

export { router as newsRouter };
