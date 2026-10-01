import { Schema, Types, model, Document } from "mongoose";

export const ROLES = ["user", "admin"] as const;

interface IAddress {
  _id?: Types.ObjectId;
  label: string; // 地址標籤（如：家、公司）
  name: string;
  phone: string;
  address: string;
  isDefault: boolean;
}

export interface IUser extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  name?: string;
  email: string;
  password: string;
  role: (typeof ROLES)[number];
  addresses: IAddress[];
  resetToken?: string;
  resetTokenExpiration?: Date;
  resetPasswordNextAllowedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    password: { type: String, required: true },
    role: { type: String, enum: ROLES, default: "user" },
    addresses: {
      type: [
        {
          label: { type: String, required: true },
          name: { type: String, required: true },
          phone: { type: String, required: true },
          address: { type: String, required: true },
          isDefault: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    resetToken: { type: String },
    resetTokenExpiration: { type: Date },
    resetPasswordNextAllowedAt: { type: Date },
  },
  { timestamps: true }
);

export const UserModel = model<IUser>("User", userSchema);
