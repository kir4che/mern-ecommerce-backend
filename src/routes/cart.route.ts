import { Router } from "express";

import {
  addToCart,
  changeQuantity,
  clearCart,
  getCart,
  removeFromCart,
  syncLocalCart,
} from "../controllers/cart.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.use(authMiddleware);

router.route("/").get(getCart).post(addToCart).delete(clearCart);
router.route("/sync").post(syncLocalCart);
router.route("/:productId").delete(removeFromCart).patch(changeQuantity);

export { router as cartRouter };
