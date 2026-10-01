import {
  findUserByEmail,
  hashPassword,
  createUserRecord,
} from "../services/user.service";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const ensureDemoUser = async () => {
  const email = process.env.DEMO_USER_EMAIL?.trim();
  const password = process.env.DEMO_USER_PASSWORD;

  if (!email || !password) return;

  const normalizedEmail = normalizeEmail(email);
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    if (existingUser.role !== "user")
      throw new Error("Demo user must have the user role.");
    return;
  }

  await createUserRecord({
    email: normalizedEmail,
    password: await hashPassword(password),
    role: "user",
  });
};
