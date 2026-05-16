import nodemailer from "nodemailer";
import { serverConfig } from "../config";
import { prisma } from "../db/prisma";
import { passwordResetTemplate } from "~/templates/email/passwordReset";

export async function sendTransactionalEmail(input: {
  recipientId?: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const { host, port, secure, user, pass, from } = serverConfig.smtp;
  if (!host || !user || !pass) {
    throw new Error("SMTP config is required before transactional email can be sent");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  try {
    const result = await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    await prisma.emailDelivery.create({
      data: {
        recipientId: input.recipientId,
        toEmail: input.to,
        subject: input.subject,
        provider: "smtp",
        providerId: result.messageId,
        sentAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.emailDelivery.create({
      data: {
        recipientId: input.recipientId,
        toEmail: input.to,
        subject: input.subject,
        provider: "smtp",
        failedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown email error",
      },
    });
    throw error;
  }
}

export async function sendPasswordResetEmail(input: { recipientId: string; to: string; resetUrl: string }) {
  const template = passwordResetTemplate(input.resetUrl);
  await sendTransactionalEmail({
    recipientId: input.recipientId,
    to: input.to,
    ...template,
  });
}
