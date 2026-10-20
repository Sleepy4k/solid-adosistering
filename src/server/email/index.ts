import "server-only";
import nodemailer from "nodemailer";
import { serverConfig } from "../config";
import { prisma } from "../db/prisma";
import { loginBlockedTemplate } from "~/templates/email/loginBlocked";
import { passwordChangedTemplate } from "~/templates/email/passwordChanged";
import { passwordResetTemplate } from "~/templates/email/passwordReset";
import { welcomeUserTemplate } from "~/templates/email/welcomeUser";
import type { EmailBrandConfig } from "~/templates/email/base";
import { sanitizeImageUrl } from "../security";

type WebConfigValue = {
  projectName?: string;
  tagline?: string;
  logoUrl?: string | null;
  primaryColor?: string;
};

function resolveLogoUrl(logoUrl: string | null | undefined): string | null {
  const safe = sanitizeImageUrl(logoUrl);
  if (!safe) return null;
  if (/^https?:\/\//i.test(safe)) return safe;
  return `${serverConfig.appOrigin}${safe}`;
}

function safeColor(value: string | undefined): string | undefined {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
}

export async function getEmailBrandConfig(): Promise<Partial<EmailBrandConfig>> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "webConfig" } });
  if (!setting?.value) return {};
  const val = setting.value as WebConfigValue;
  return {
    projectName: val.projectName ?? undefined,
    tagline: val.tagline ?? undefined,
    logoUrl: resolveLogoUrl(val.logoUrl),
    primaryColor: safeColor(val.primaryColor),
  };
}

export function createSmtpTransporter() {
  const { host, port, secure, user, pass } = serverConfig.smtp;

  if (!host || !user || !pass) {
    const missing = [!host && "SMTP_HOST", !user && "SMTP_USER", !pass && "SMTP_PASS"].filter(Boolean);
    throw new Error(`SMTP not configured: ${missing.join(", ")} missing`);
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: { rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false" },
  });
}

function resolveFrom(): string {
  const from = serverConfig.smtp.from;
  if (from) return from;
  return `Adosistering <${serverConfig.smtp.user}>`;
}

export async function sendTransactionalEmail(
  input: { recipientId?: string; to: string; subject: string; text: string; html?: string },
  transporter?: ReturnType<typeof nodemailer.createTransport>,
) {
  const t = transporter ?? createSmtpTransporter();

  let messageId: string | undefined;
  let smtpError: unknown;

  try {
    const result = await t.sendMail({
      from: resolveFrom(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    messageId = result.messageId;
  } catch (err) {
    smtpError = err;
  }

  prisma.emailDelivery
    .create({
      data: {
        recipientId: input.recipientId,
        toEmail: input.to,
        subject: input.subject,
        provider: "smtp",
        ...(smtpError
          ? {
              failedAt: new Date(),
              error: smtpError instanceof Error ? smtpError.message : "Unknown email error",
            }
          : { providerId: messageId, sentAt: new Date() }),
      },
    })
    .catch((err: unknown) => console.error("[email] DB log failed:", err));

  if (smtpError) throw smtpError;
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
