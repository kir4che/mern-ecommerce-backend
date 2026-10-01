import { Request, Response } from "express";
import { Types } from "mongoose";

import {
  createPaymentRequest,
  finalizePaidOrder,
  findPaymentCallbackOrder,
  generateCheckValue,
  loadPayableOrder,
  markPaymentFailure,
} from "../services/payment.service";

const ALLOWED_PAYMENT_METHODS = ["ATM", "WebATM", "Credit"] as const;
const PHONE_REGEX = /^09\d{8}$/;

const respondToPaymentError = (res: Response, err: unknown) => {
  if (!(err instanceof Error)) return undefined;

  switch (err.message) {
    case "INVALID_ORDER_ID":
      return res.status(400).json({
        success: false,
        code: "INVALID_ORDER_ID",
        message: "Invalid order ID format.",
      });
    case "ORDER_NOT_FOUND":
      return res.status(404).json({
        success: false,
        code: "ORDER_NOT_FOUND",
        message: "Order not found.",
      });
    case "ORDER_PAYMENT_FORBIDDEN":
      return res.status(403).json({
        success: false,
        code: "ORDER_PAYMENT_FORBIDDEN",
        message: "You are not authorized to pay this order.",
      });
    case "ORDER_ALREADY_PAID":
      return res.status(400).json({
        success: false,
        code: "ORDER_ALREADY_PAID",
        message: "This order has already been paid.",
      });
    case "ORDER_CANNOT_PAY":
      return res.status(400).json({
        success: false,
        code: "ORDER_CANNOT_PAY",
        message: "This order is not available for payment.",
      });
    case "ORDER_EXPIRED":
      return res.status(400).json({
        success: false,
        code: "ORDER_EXPIRED",
        message: "This order has expired and has been canceled.",
      });
    case "PAYMENT_CONFIG_MISSING":
      return res.status(500).json({
        success: false,
        code: "PAYMENT_CONFIG_MISSING",
        message: "Payment configuration is incomplete.",
      });
    case "PRODUCT_NOT_FOUND":
      return res.status(404).json({
        success: false,
        code: "PRODUCT_NOT_FOUND",
        message: "One or more products were not found.",
      });
    default:
      return undefined;
  }
};

const createPaymentHandler = async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    return res.status(400).json({
      success: false,
      code: "INVALID_PAYMENT_REQUEST",
      message: "Payment request body must be an object.",
    });

  const { orderId, name, phone, address, note, ChoosePayment } = req.body;
  const isValidPaymentMethod =
    typeof ChoosePayment === "string" &&
    ALLOWED_PAYMENT_METHODS.includes(
      ChoosePayment as (typeof ALLOWED_PAYMENT_METHODS)[number]
    );
  const isInvalidRequest =
    typeof orderId !== "string" ||
    typeof name !== "string" ||
    !name.trim() ||
    typeof phone !== "string" ||
    !PHONE_REGEX.test(phone) ||
    typeof address !== "string" ||
    !address.trim() ||
    !isValidPaymentMethod ||
    (note !== undefined && typeof note !== "string");

  if (isInvalidRequest)
    return res.status(400).json({
      success: false,
      code: "INVALID_PAYMENT_REQUEST",
      message: "Invalid payment request data.",
    });

  try {
    const result = await createPaymentRequest({
      orderId,
      userId: req.userId!,
      isAdmin: req.role === "admin",
      name,
      phone,
      address,
      note,
      paymentMethod: ChoosePayment,
    });

    res.json({ success: true, params: result.params });
  } catch (err: unknown) {
    const response = respondToPaymentError(res, err);

    if (response) return response;

    throw err;
  }
};

// 綠界付款完成後的處理
const handlePaymentCallback = async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    return res.status(400).send("0");

  const { CheckMacValue, ...callbackData } = req.body;
  const { RtnCode, PaymentDate, CustomField1, MerchantTradeNo, TradeAmt } =
    callbackData;
  let expectedCheckMacValue: string;

  try {
    expectedCheckMacValue = generateCheckValue(callbackData);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "PAYMENT_CONFIG_MISSING")
      return res.status(500).send("0");

    throw err;
  }

  if (
    typeof CheckMacValue !== "string" ||
    CheckMacValue !== expectedCheckMacValue
  )
    return res.status(403).send("0");

  const orderId = typeof CustomField1 === "string" ? CustomField1 : "";

  if (!Types.ObjectId.isValid(orderId) || typeof MerchantTradeNo !== "string")
    return res.status(400).send("0");

  const order = await findPaymentCallbackOrder(orderId);
  if (!order) return res.status(404).send("0");

  // CheckMacValue 證明通知來自綠界；這裡再比對訂單資料，避免合法通知被套到錯誤訂單。
  if (order.tradeNo !== MerchantTradeNo) return res.status(400).send("0");

  const callbackAmount = Number(TradeAmt);

  if (!Number.isFinite(callbackAmount) || callbackAmount !== order.totalAmount)
    return res.status(400).send("0");

  if (String(RtnCode) !== "1") {
    await markPaymentFailure(orderId);

    return res.status(200).send("1|OK");
  }

  const parsedPaymentDate = PaymentDate ? new Date(PaymentDate) : new Date();
  const safePaymentDate = Number.isNaN(parsedPaymentDate.getTime())
    ? new Date()
    : parsedPaymentDate;

  try {
    await finalizePaidOrder({
      orderId,
      paymentDate: safePaymentDate,
      tradeNo: MerchantTradeNo,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "PRODUCT_NOT_FOUND")
      return res.status(500).send("0");
    throw err;
  }

  return res.status(200).send("1|OK");
};

// 開發模式跳過綠界，直接模擬付款成功。
const devPayOrder = async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production")
    return res.status(403).json({
      success: false,
      code: "DEV_ENDPOINT_DISABLED",
      message: "Dev-pay is only available in non-production environments.",
    });

  const orderId = req.params.orderId as string;

  try {
    const order = await loadPayableOrder({
      orderId,
      userId: req.userId!,
      isAdmin: req.role === "admin",
    });

    const result = await finalizePaidOrder({
      orderId,
      paymentDate: new Date(),
      tradeNo: order.tradeNo,
    });

    // Dev payment 只能對 unpaid 訂單執行
    if (result.status === "already-processed")
      return res.status(400).json({
        success: false,
        code: "ORDER_ALREADY_PAID",
        message: "This order has already been paid.",
      });

    res.json({
      success: true,
      code: "PAYMENT_SIMULATED",
      message: "Payment simulated successfully (dev mode).",
    });
  } catch (err: unknown) {
    const response = respondToPaymentError(res, err);
    if (response) return response;

    throw err;
  }
};

export { createPaymentHandler, devPayOrder, handlePaymentCallback };
