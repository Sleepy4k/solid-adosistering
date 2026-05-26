import nodemailer from "nodemailer";
import { serverConfig } from "../config";
import { prisma } from "../db/prisma";
import { loginBlockedTemplate } from "~/templates/email/loginBlocked";
import { passwordChangedTemplate } from "~/templates/email/passwordChanged";
import { passwordResetTemplate } from "~/templates/email/passwordReset";
import { welcomeUserTemplate } from "~/templates/email/welcomeUser";
import type { EmailBrandConfig } from "~/templates/email/base";

type WebConfigValue = {
  projectName?: string;
  tagline?: string;
  logoUrl?: string | null;
  primaryColor?: string;
};

function resolveLogoUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) return logoUrl;
  return `${serverConfig.appOrigin}${logoUrl}`;
}

export async function getEmailBrandConfig(): Promise<Partial<EmailBrandConfig>> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "webConfig" } });
  if (!setting?.value) return {};
  const val = setting.value as WebConfigValue;
  return {
    projectName: val.projectName ?? undefined,
    tagline: val.tagline ?? undefined,
    logoUrl: resolveLogoUrl(val.logoUrl),
    primaryColor: val.primaryColor ?? undefined,
  };
}

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
  const config = await getEmailBrandConfig();
  const template = passwordResetTemplate(input.resetUrl, config);
  await sendTransactionalEmail({ recipientId: input.recipientId, to: input.to, ...template });
}

export async function sendPasswordChangedEmail(input: { recipientId: string; to: string; userName: string }) {
  const config = await getEmailBrandConfig();
  const template = passwordChangedTemplate(input.userName, config);
  await sendTransactionalEmail({ recipientId: input.recipientId, to: input.to, ...template });
}

export async function sendLoginBlockedEmail(input: {
  recipientId: string;
  to: string;
  userName: string;
  cooldownMinutes: number;
}) {
  const config = await getEmailBrandConfig();
  const template = loginBlockedTemplate(input.userName, input.cooldownMinutes, config);
  await sendTransactionalEmail({ recipientId: input.recipientId, to: input.to, ...template });
}

export async function sendWelcomeUserEmail(input: {
  recipientId: string;
  to: string;
  name: string;
  email: string;
  password: string;
  loginUrl: string;
}) {
  const config = await getEmailBrandConfig();
  const template = welcomeUserTemplate({ ...input, config });
  await sendTransactionalEmail({ recipientId: input.recipientId, to: input.to, ...template });
}
