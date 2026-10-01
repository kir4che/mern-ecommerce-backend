import { v2 as cloudinary } from "cloudinary";

const cloudinaryUrl = process.env.CLOUDINARY_URL?.trim();

if (!cloudinaryUrl)
  throw new Error("CLOUDINARY_URL is required for Cloudinary configuration.");

cloudinary.config({ cloudinary_url: cloudinaryUrl });

if (!cloudinary.config().cloud_name)
  throw new Error("CLOUDINARY_URL does not contain a valid cloud name.");

export { cloudinary };
