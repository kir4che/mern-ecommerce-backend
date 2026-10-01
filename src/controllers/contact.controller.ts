import { Request, Response } from "express";
import { sendContactEmail } from "../services/contact.service";

const CONTACT_FIELD_LIMITS = {
  name: 100,
  email: 254,
  subject: 200,
  message: 5000,
} as const;
const isValidContactField = (
  value: unknown,
  maxLength: number
): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= maxLength;
const sendContact = async (req: Request, res: Response) => {
  if (!req.body)
    return res.status(400).json({
      success: false,
      code: "INVALID_CONTACT_REQUEST",
      message: "Contact request body is required.",
    });
  const { name, email, subject, message } = req.body;
  if (
    !isValidContactField(name, CONTACT_FIELD_LIMITS.name) ||
    !isValidContactField(email, CONTACT_FIELD_LIMITS.email) ||
    !isValidContactField(subject, CONTACT_FIELD_LIMITS.subject) ||
    !isValidContactField(message, CONTACT_FIELD_LIMITS.message)
  )
    return res.status(400).json({
      success: false,
      code: "INVALID_CONTACT_DATA",
      message: "Contact fields are invalid.",
    });
  const trimmedEmail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
    return res.status(400).json({
      success: false,
      code: "INVALID_EMAIL",
      message: "Please provide a valid email address.",
    });
  await sendContactEmail({
    name: name.trim(),
    email: trimmedEmail,
    subject: subject.trim(),
    message: message.trim(),
  });
  return res.status(200).json({
    success: true,
    code: "CONTACT_MESSAGE_SENT",
    message:
      "Your message has been sent successfully. We will get back to you shortly.",
  });
};
export { sendContact };
