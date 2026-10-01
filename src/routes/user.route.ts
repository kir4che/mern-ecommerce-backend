import { Router } from "express";

import {
  addAddress,
  changePassword,
  createNewUser,
  deleteAddress,
  getAddresses,
  getMe,
  getUsers,
  loginUser,
  logoutUser,
  resetPassword,
  updateAddress,
  updatePassword,
} from "../controllers/user.controller";
import {
  authMiddleware,
  isAdmin,
  optionalAuthMiddleware,
} from "../middlewares/auth.middleware";

const router = Router();

router.route("/register").post(createNewUser);
router.route("/login").post(loginUser);
router.route("/reset-password").post(resetPassword);
router.route("/reset-password/:token").patch(updatePassword);
router.route("/me").get(optionalAuthMiddleware, getMe);

router.use(authMiddleware);

router.route("/password").patch(changePassword);
router.route("/logout").post(logoutUser);
router.route("/addresses").get(getAddresses).post(addAddress);
router.route("/addresses/:addressId").put(updateAddress).delete(deleteAddress);

const adminUserRouter = Router();
adminUserRouter.use(authMiddleware, isAdmin);
adminUserRouter.route("/").get(getUsers);

export { router as userRouter, adminUserRouter };
