import type { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { sendPasswordResetEmail } from "../services/password-reset-email.service";
import {
  addAddressToUser,
  createPasswordResetToken,
  createUserRecord,
  deleteAddressFromUser,
  findPublicUser,
  findUserAddresses,
  findUserByEmail,
  findUserById,
  findUserByResetToken,
  hashPassword,
  hashPasswordResetToken,
  listUsers,
  updateAddressInTransaction,
  verifyPassword,
} from "../services/user.service";

import { SESSION_NAME } from "../config/session";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

// 密碼至少 8 字元，包含大寫、小寫英文及數字。
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/;
const ADDRESS_PHONE_REGEX = /^09\d{8}$/;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isProduction = process.env.NODE_ENV === "production";

// 清除 session cookie
const clearSessionCookie = (res: Response) => {
  res.clearCookie(SESSION_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
  });
};

// 建立使用者（註冊）
const createNewUser = async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    return res.status(400).json({
      success: false,
      code: "INVALID_REGISTER_REQUEST",
      message: "Register request body must be an object.",
    });

  const { email, password } = req.body;

  if (typeof email !== "string" || !normalizeEmail(email))
    return res.status(400).json({
      success: false,
      code: "EMAIL_REQUIRED",
      message: "Email is required.",
    });

  // 伺服器端再次驗證密碼強度，防止略過前端直接打 API 註冊弱密碼。
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    !PASSWORD_REGEX.test(password)
  )
    return res.status(400).json({
      success: false,
      code: "WEAK_PASSWORD",
      message:
        "Password must be at least 8 characters and include uppercase, lowercase, and numbers.",
    });

  const normalizedEmail = normalizeEmail(email);
  const hashedPassword = await hashPassword(password);

  try {
    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) throw new Error("USER_ALREADY_EXISTS");

    await createUserRecord({
      email: normalizedEmail,
      password: hashedPassword,
    });

    res.status(201).json({
      success: true,
      code: "USER_REGISTERED",
      message: "User registered Successfully!",
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "USER_ALREADY_EXISTS")
      return res.status(409).json({
        success: false,
        code: "USER_ALREADY_EXISTS",
        message: "User already Exists!",
      });

    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 11000
    )
      return res.status(409).json({
        success: false,
        code: "USER_ALREADY_EXISTS",
        message: "User already Exists!",
      });

    throw err;
  }
};

// 驗證密碼後建立 session，rememberMe 控制 cookie 有效期。
const loginUser = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    return res.status(400).json({
      success: false,
      code: "INVALID_LOGIN_REQUEST",
      message: "Login request body must be an object.",
    });

  const { email, password, rememberMe } = req.body;

  if (
    typeof email !== "string" ||
    !normalizeEmail(email) ||
    typeof password !== "string" ||
    !password ||
    (rememberMe !== undefined && typeof rememberMe !== "boolean")
  )
    return res.status(400).json({
      success: false,
      code: "LOGIN_FIELDS_REQUIRED",
      message: "Email and password are required.",
    });

  const user = await findUserByEmail(normalizeEmail(email));

  if (!user)
    return res.status(400).json({
      success: false,
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password!",
    });

  // 確認 password 是否正確
  const passwordMatch = await verifyPassword(user.password, password);

  if (!passwordMatch)
    return res.status(400).json({
      success: false,
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password!",
    });

  // 寫入 session
  req.session.userId = user._id.toString();
  req.session.role = user.role as "user" | "admin";

  // rememberMe = true → cookie 保留 7 天；false → 關瀏覽器即失效
  if (rememberMe) {
    req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000;
  }

  req.session.save((err: Error | null) => {
    if (err) return next(err);

    res.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role as "user" | "admin",
      },
    });
  });
};

/** 銷毀 session 使使用者登出。 */
const logoutUser = async (req: Request, res: Response, next: NextFunction) => {
  req.session.destroy((err: Error | null) => {
    if (err) return next(err);

    clearSessionCookie(res);

    res.status(200).json({
      success: true,
      code: "USER_LOGGED_OUT",
      message: "User logged out Successfully!",
    });
  });
};

// 驗證舊密碼後更新新密碼
const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    return res.status(400).json({
      success: false,
      code: "INVALID_PASSWORD_REQUEST",
      message: "Password request body must be an object.",
    });

  const { currentPassword, newPassword } = req.body;

  if (!isNonEmptyString(currentPassword) || !isNonEmptyString(newPassword))
    return res.status(400).json({
      success: false,
      code: "PASSWORD_FIELDS_REQUIRED",
      message: "currentPassword and newPassword are required.",
    });

  if (!PASSWORD_REGEX.test(newPassword))
    return res.status(400).json({
      success: false,
      code: "WEAK_PASSWORD",
      message:
        "Password must be at least 8 characters and include uppercase, lowercase, and numbers.",
    });

  const user = await findUserById(req.userId!);

  if (!user)
    return res.status(404).json({
      success: false,
      code: "USER_NOT_FOUND",
      message: "User not found.",
    });

  // 驗證舊密碼
  const isMatch = await verifyPassword(user.password, currentPassword);

  if (!isMatch)
    return res.status(400).json({
      success: false,
      code: "INVALID_CURRENT_PASSWORD",
      message: "Current password is incorrect.",
    });

  user.password = await hashPassword(newPassword);
  await user.save();

  // 改密碼後銷毀當前 session，強制重新登入。
  req.session.destroy((err: Error | null) => {
    if (err) return next(err);

    clearSessionCookie(res);

    res.status(200).json({
      success: true,
      code: "PASSWORD_UPDATED",
      message: "Password updated. Please log in again.",
    });
  });
};

// 產生短期有效的重設 token 並限制重複寄信
const resetPassword = async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    return res.status(400).json({
      success: false,
      code: "INVALID_RESET_REQUEST",
      message: "Reset request body must be an object.",
    });

  const { email } = req.body;
  const cooldownSeconds = 60;

  if (typeof email !== "string" || !normalizeEmail(email))
    return res.status(400).json({
      success: false,
      code: "EMAIL_REQUIRED",
      message: "Email is required.",
    });

  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!user)
    return res.status(200).json({
      success: true,
    });

  const now = Date.now();
  const nextAllowedAt = user.resetPasswordNextAllowedAt?.getTime();

  if (nextAllowedAt && nextAllowedAt > now)
    return res.status(429).json({
      success: false,
      code: "RESET_PASSWORD_COOLDOWN",
      message: "Please wait before requesting another reset email.",
      retryAfter: Math.ceil((nextAllowedAt - now) / 1000),
    });

  // 產生一次性 Token，用 SHA-256 hash 後存入 DB（避免 DB 洩漏時 token 可直接重設密碼）。
  const resetToken = createPasswordResetToken();
  const hashedResetToken = hashPasswordResetToken(resetToken);
  user.resetToken = hashedResetToken;
  user.resetTokenExpiration = new Date(Date.now() + 60 * 60 * 1000); // 1 小時有效期
  user.resetPasswordNextAllowedAt = new Date(now + cooldownSeconds * 1000);
  await user.save();

  try {
    await sendPasswordResetEmail({
      email: normalizedEmail,
      token: resetToken,
    });
  } catch (err: unknown) {
    user.resetToken = undefined;
    user.resetTokenExpiration = undefined;
    user.resetPasswordNextAllowedAt = undefined;
    await user.save();
    throw err;
  }

  res.status(200).json({ success: true, retryAfter: cooldownSeconds });
};

// 消耗一次性重設 token 並使既有的 refresh token 失效
const updatePassword = async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    return res.status(400).json({
      success: false,
      code: "INVALID_PASSWORD_REQUEST",
      message: "Password request body must be an object.",
    });

  const { token } = req.params;
  const { password } = req.body;

  // 將收到的明文 token 做 SHA-256 hash 才能與 DB 中的 hash 值比對
  const hashedToken = hashPasswordResetToken(String(token));

  const user = await findUserByResetToken(hashedToken);

  if (!user)
    return res.status(400).json({
      success: false,
      code: "INVALID_RESET_TOKEN",
      message: "Invalid or expired token!",
    });

  // 伺服器端再次驗證密碼強度（重設密碼時同樣需要）
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    !PASSWORD_REGEX.test(password)
  )
    return res.status(400).json({
      success: false,
      code: "WEAK_PASSWORD",
      message:
        "Password must be at least 8 characters and include uppercase, lowercase, and numbers.",
    });

  const hashedPassword = await hashPassword(password);
  user.password = hashedPassword;

  user.resetToken = undefined;
  user.resetTokenExpiration = undefined;
  await user.save();

  // 重設密碼後銷毀當前 session，強制重新登入。
  req.session.destroy((err: Error | null) => {
    if (err)
      return res.status(200).json({
        success: true,
        message: "Password updated but session not cleared.",
      });

    clearSessionCookie(res);

    res
      .status(200)
      .json({ success: true, message: "Password updated successfully!" });
  });
};

const getUsers = async (req: Request, res: Response) => {
  const { page = 1, limit = 20, search } = req.query;
  const result = await listUsers({ page, limit, search });
  res.status(200).json({ success: true, ...result });
};

// 回傳當前使用者的已儲存地址
const getAddresses = async (req: Request, res: Response) => {
  const user = await findUserAddresses(req.userId!);

  if (!user)
    return res.status(404).json({
      success: false,
      code: "USER_NOT_FOUND",
      message: "User not found.",
    });

  res.status(200).json({ success: true, addresses: user.addresses });
};

const addAddress = async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    return res.status(400).json({
      success: false,
      code: "INVALID_ADDRESS_REQUEST",
      message: "Address request body must be an object.",
    });

  const { label, name, phone, address, isDefault } = req.body;

  if (
    !isNonEmptyString(label) ||
    !isNonEmptyString(name) ||
    !isNonEmptyString(phone) ||
    !ADDRESS_PHONE_REGEX.test(phone) ||
    !isNonEmptyString(address) ||
    (isDefault !== undefined && typeof isDefault !== "boolean")
  )
    return res.status(400).json({
      success: false,
      code: "INVALID_ADDRESS_DATA",
      message: "Address fields are invalid.",
    });

  const existingUser = await findUserAddresses(req.userId!);

  if (!existingUser)
    return res.status(404).json({
      success: false,
      code: "USER_NOT_FOUND",
      message: "User not found.",
    });

  const hasExistingAddresses = existingUser.addresses.length > 0;
  const shouldBeDefault = isDefault === true || !hasExistingAddresses;

  const user = await addAddressToUser(
    req.userId!,
    {
      label: label.trim(),
      name: name.trim(),
      phone,
      address: address.trim(),
      isDefault: shouldBeDefault,
    },
    shouldBeDefault && hasExistingAddresses
  );

  if (!user)
    return res.status(404).json({
      success: false,
      code: "USER_NOT_FOUND",
      message: "User not found.",
    });

  res.status(201).json({ success: true, addresses: user.addresses });
};

const updateAddress = async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    return res.status(400).json({
      success: false,
      code: "INVALID_ADDRESS_REQUEST",
      message: "Address request body must be an object.",
    });

  const addressId = req.params.addressId as string;
  const { label, name, phone, address, isDefault } = req.body;

  if (!Types.ObjectId.isValid(addressId))
    return res.status(400).json({
      success: false,
      code: "INVALID_ADDRESS_ID",
      message: "Invalid address ID.",
    });

  const updateFields: Record<string, unknown> = {};

  if (label !== undefined) {
    if (!isNonEmptyString(label))
      return res.status(400).json({
        success: false,
        code: "INVALID_ADDRESS_DATA",
        message: "Address fields are invalid.",
      });
    updateFields["addresses.$.label"] = label.trim();
  }
  if (name !== undefined) {
    if (!isNonEmptyString(name))
      return res.status(400).json({
        success: false,
        code: "INVALID_ADDRESS_DATA",
        message: "Address fields are invalid.",
      });
    updateFields["addresses.$.name"] = name.trim();
  }
  if (phone !== undefined) {
    if (!isNonEmptyString(phone) || !ADDRESS_PHONE_REGEX.test(phone))
      return res.status(400).json({
        success: false,
        code: "INVALID_ADDRESS_DATA",
        message: "Address fields are invalid.",
      });
    updateFields["addresses.$.phone"] = phone;
  }
  if (address !== undefined) {
    if (!isNonEmptyString(address))
      return res.status(400).json({
        success: false,
        code: "INVALID_ADDRESS_DATA",
        message: "Address fields are invalid.",
      });
    updateFields["addresses.$.address"] = address.trim();
  }
  if (isDefault !== undefined && typeof isDefault !== "boolean")
    return res.status(400).json({
      success: false,
      code: "INVALID_ADDRESS_DATA",
      message: "Address fields are invalid.",
    });
  if (isDefault !== undefined)
    updateFields["addresses.$.isDefault"] = isDefault;

  if (Object.keys(updateFields).length === 0)
    return res.status(400).json({
      success: false,
      code: "NO_UPDATE_DATA",
      message: "No fields to update.",
    });

  try {
    const updatedUser = await updateAddressInTransaction(
      req.userId!,
      addressId,
      updateFields,
      isDefault === true
    );

    return res
      .status(200)
      .json({ success: true, addresses: updatedUser.addresses });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "ADDRESS_NOT_FOUND")
      return res.status(404).json({
        success: false,
        code: "ADDRESS_NOT_FOUND",
        message: "Address not found.",
      });

    throw err;
  }
};

const deleteAddress = async (req: Request, res: Response) => {
  const addressId = req.params.addressId as string;

  if (!Types.ObjectId.isValid(addressId))
    return res.status(400).json({
      success: false,
      code: "INVALID_ADDRESS_ID",
      message: "Invalid address ID.",
    });

  const user = await deleteAddressFromUser(req.userId!, addressId);

  if (!user)
    return res.status(404).json({
      success: false,
      code: "ADDRESS_NOT_FOUND",
      message: "Address not found.",
    });

  res.status(200).json({
    success: true,
    code: "ADDRESS_DELETED",
    message: "Address deleted.",
    addresses: user.addresses,
  });
};

const getMe = async (req: Request, res: Response) => {
  if (!req.userId) return res.status(200).json({ success: true, user: null });

  const user = await findPublicUser(req.userId);

  if (!user)
    return res.status(404).json({
      success: false,
      code: "USER_NOT_FOUND",
      message: "User not found.",
    });

  res.status(200).json({
    success: true,
    user: {
      id: user._id.toString(),
      email: user.email,
      role: user.role as "user" | "admin",
    },
  });
};

export {
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
};
