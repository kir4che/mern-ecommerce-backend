import rateLimit from "express-rate-limit";

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    code: "AUTH_RATE_LIMIT_EXCEEDED",
    message: "Too many login attempts, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const couponLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    code: "COUPON_RATE_LIMIT_EXCEEDED",
    message: "Too many coupon validation attempts, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    code: "CONTACT_RATE_LIMIT_EXCEEDED",
    message: "Too many contact form submissions, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
