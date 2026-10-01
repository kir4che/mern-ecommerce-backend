import { Router } from "express";

import { sendContact } from "../controllers/contact.controller";
import { contactLimiter } from "../middlewares/rateLimit.middleware";

const router = Router();

router.route("/").post(contactLimiter, sendContact);

export { router as contactRouter };
