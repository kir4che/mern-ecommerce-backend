import { Document, Schema, Types, model } from "mongoose";

interface IProduct extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  title: string;
  tagline: string;
  categories: string[];
  description: string;
  price: number;
  content: string; // 內容物
  expiryDate: string; // 有效期限
  allergens: string[]; // 過敏原
  delivery: string; // 配送
  storage: string; // 保存方式
  ingredients: string; // 成分
  nutrition: string; // 營養成分
  countInStock: number;
  salesCount: number; // 銷量
  tags: string[]; // 標籤
  imageUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    title: { type: String, required: true },
    tagline: { type: String, default: "" },
    categories: { type: [String], required: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    content: { type: String, default: "" },
    expiryDate: { type: String, default: "" },
    allergens: { type: [String], default: [] },
    delivery: { type: String, default: "常溫宅配" },
    storage: { type: String, default: "請保存於陰涼處，避免高溫或陽光照射。" },
    ingredients: { type: String, default: "" },
    nutrition: { type: String, default: "" },
    countInStock: { type: Number, default: 0, min: 0 },
    salesCount: { type: Number, default: 0, min: 0 },
    tags: {
      type: [String],
      default: [],
    },
    imageUrl: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

productSchema.index({ categories: 1 });
productSchema.index({ tags: 1 });

export const ProductModel = model<IProduct>("Product", productSchema);
