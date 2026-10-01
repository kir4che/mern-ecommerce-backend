import mongoose from "mongoose";

const isDev = process.env.NODE_ENV !== "production";

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || "");
    if (isDev) console.log("[INFO] Connected to MongoDB.");
  } catch (err: unknown) {
    console.error("[ERROR] MongoDB connection err:", err);
    process.exit(1);
  }
};
