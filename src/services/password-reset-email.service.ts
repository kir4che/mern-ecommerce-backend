import nodemailer from "nodemailer";

interface SendPasswordResetEmailOptions {
  email: string;
  token: string;
}

let transporter: nodemailer.Transporter | null = null;

export const sendPasswordResetEmail = async ({
  email,
  token,
}: SendPasswordResetEmailOptions): Promise<void> => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });
  }

  await transporter.sendMail({
    from: `"日出麵包坊" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "重設密碼通知信",
    html: `
      <p>您好，</p>
      <p>請點擊下方連結以重設您的密碼：</p>
      <a href="${resetUrl}" target="_blank" style="color: #007bff; text-decoration: none;">重設密碼</a>
      <p>此連結將在 1 小時內失效，<br/>如果未有忘記密碼的需求，請忽略此郵件。</p>
      <br/>
      <br/>
      <p>日出麵包坊 🍞</p>
    `,
  });
};
