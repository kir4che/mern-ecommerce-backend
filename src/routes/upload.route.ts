import { Router } from "express";
import { uploadImage as uploadImageHandler } from "../controllers/upload.controller";
import { authMiddleware, isAdmin } from "../middlewares/auth.middleware";
import { uploadImage } from "../middlewares/upload.middleware";

const router = Router();

router.use(authMiddleware);
router.post("/image", isAdmin, uploadImage.single("image"), uploadImageHandler);

export { router as uploadRouter };
