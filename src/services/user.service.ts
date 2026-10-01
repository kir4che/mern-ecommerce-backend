import argon2 from "argon2";
import crypto from "crypto";
import { Types } from "mongoose";

import { UserModel } from "../models/user.model";
import { escapeRegex } from "../utils/regex";
import { parsePositiveInt } from "../utils/number";

export const findUserByEmail = (email: string) => UserModel.findOne({ email });
export const hashPassword = (password: string) => argon2.hash(password);
export const verifyPassword = (hash: string, password: string) =>
  argon2.verify(hash, password);
export const createPasswordResetToken = () =>
  crypto.randomBytes(32).toString("hex");
export const hashPasswordResetToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");
export const createUserRecord = (data: Record<string, unknown>) =>
  UserModel.create(data);
export const findUserById = (id: Types.ObjectId | string) =>
  UserModel.findById(id);
export const findUserByResetToken = (token: string) =>
  UserModel.findOne({
    resetToken: token,
    resetTokenExpiration: { $gt: new Date() },
  });

export const listUsers = (query: {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
}) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, 20, 100);
  const filter: Record<string, unknown> = {};
  if (query.search)
    filter.email = {
      $regex: escapeRegex(query.search as string),
      $options: "i",
    };
  return Promise.all([
    UserModel.countDocuments(filter),
    UserModel.find(filter)
      .select("name email role createdAt")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]).then(([total, users]) => ({
    users,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }));
};

export const findUserAddresses = (id: Types.ObjectId | string) =>
  UserModel.findById(id).select("addresses");

export const addAddressToUser = (
  id: Types.ObjectId,
  address: Record<string, unknown>,
  clearDefaults: boolean
) =>
  UserModel.findByIdAndUpdate(
    id,
    {
      $push: { addresses: address },
      ...(clearDefaults ? { $set: { "addresses.$[].isDefault": false } } : {}),
    },
    { returnDocument: "after", runValidators: true }
  );

export const updateAddressInTransaction = async (
  userId: Types.ObjectId,
  addressId: string,
  updateFields: Record<string, unknown>,
  isDefault: boolean
) => {
  const session = await UserModel.startSession(); // 開啟交易 session
  try {
    // 用 transaction 確保「清除其他預設地址 + 更新目標地址」原子性
    return await session.withTransaction(async () => {
      const existingUser = await UserModel.findOne({
        _id: userId,
        "addresses._id": addressId,
      }).session(session);
      if (!existingUser) throw new Error("ADDRESS_NOT_FOUND");
      if (isDefault === true)
        await UserModel.updateOne(
          { _id: userId },
          { $set: { "addresses.$[].isDefault": false } },
          { session }
        );
      const user = await UserModel.findOneAndUpdate(
        { _id: userId, "addresses._id": addressId },
        { $set: updateFields },
        { returnDocument: "after", runValidators: true, session }
      );
      if (!user) throw new Error("ADDRESS_NOT_FOUND");
      return user;
    });
  } finally {
    await session.endSession();
  }
};

export const deleteAddressFromUser = (
  userId: Types.ObjectId,
  addressId: string
) =>
  UserModel.findOneAndUpdate(
    { _id: userId, "addresses._id": addressId },
    { $pull: { addresses: { _id: addressId } } },
    { returnDocument: "after" }
  );
export const findPublicUser = (id: Types.ObjectId | string) =>
  UserModel.findById(id).select("name email role").lean();
