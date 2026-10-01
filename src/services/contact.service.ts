import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
});

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const sendContactEmail = async (input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) => {
  // 聯絡表單內容只在 service 層組裝與寄送，controller 不依賴郵件 SDK。
  await transporter.sendMail({
    from: `"日出麵包坊" <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER,
    replyTo: input.email,
    subject: `網站聯絡表單：${input.subject}`,
    html: `<h3>來自網站聯絡表單的訊息</h3><p><strong>姓名：</strong> ${escapeHtml(input.name)}</p><p><strong>Email：</strong> ${escapeHtml(input.email)}</p><p><strong>主旨：</strong> ${escapeHtml(input.subject)}</p><p><strong>訊息：</strong></p><p>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p>`,
  });
};
