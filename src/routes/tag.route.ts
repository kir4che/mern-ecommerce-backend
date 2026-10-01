import { Router } from "express";

import {
  createTag,
  deleteTag,
  getAllTags,
  getTags,
  updateTag,
} from "../controllers/tag.controller";
import { authMiddleware, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

router.route("/").get(getTags);

router.use(authMiddleware);
router.route("/all").get(isAdmin, getAllTags);
router.route("/").post(isAdmin, createTag);
router.route("/:id").patch(isAdmin, updateTag).delete(isAdmin, deleteTag);

export { router as tagRouter };
