import { Router } from "express";

import {
  addProduct,
  deleteProductById,
  getProductById,
  getProducts,
  updateProduct,
} from "../controllers/product.controller";
import { authMiddleware, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

router.route("/").get(getProducts).post(authMiddleware, isAdmin, addProduct);
router
  .route("/:id")
  .get(getProductById)
  .patch(authMiddleware, isAdmin, updateProduct)
  .delete(authMiddleware, isAdmin, deleteProductById);

export { router as productRouter };
