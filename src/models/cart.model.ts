import { Document, Schema, Types, model } from "mongoose";

export interface ICartItem {
  productId: Types.ObjectId;
  quantity: number;
}

interface ICart extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  items: ICartItem[];
}

const cartItemSchema = new Schema<ICartItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity cannot be less than 1"],
    },
  },
  { _id: false }
);

const cartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
);

cartSchema.index({ userId: 1 }, { unique: true });

export const CartModel = model<ICart>("Cart", cartSchema);
