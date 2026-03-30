import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

export interface EmailConfigData {
  imapHost: string;
  imapPort: number;
  imapSsl: boolean;
  imapLogin: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: number;
  smtpSsl: boolean;
  smtpLogin: string;
  smtpPassword: string;
  fromName: string;
  fromEmail: string;
  isEnabled: boolean;
  lastSyncAt: Date | null;
}

export async function loadEmailConfig(userId: string, db?: PrismaClient): Promise<EmailConfigData | null> {
  const actualDb = db ?? prisma;
  const config = await actualDb.emailConfig.findUnique({ where: { userId } });
  if (!config) return null;
  return {
    imapHost: config.imapHost,
    imapPort: config.imapPort,
    imapSsl: config.imapSsl,
    imapLogin: config.imapLogin,
    imapPassword: config.imapPassword, // Note: returned masked for display
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSsl: config.smtpSsl,
    smtpLogin: config.smtpLogin,
    smtpPassword: config.smtpPassword,
    fromName: config.fromName,
    fromEmail: config.fromEmail,
    isEnabled: config.isEnabled,
    lastSyncAt: config.lastSyncAt,
  };
}

export async function saveEmailConfig(
  userId: string,
  data: Partial<EmailConfigData>,
  db?: PrismaClient
): Promise<EmailConfigData> {
  const actualDb = db ?? prisma;
  const sanitized: Record<string, unknown> = {};
  if (data.imapHost !== undefined) sanitized.imapHost = String(data.imapHost).trim();
  if (data.imapPort !== undefined) sanitized.imapPort = Math.max(1, Math.min(65535, Number(data.imapPort) || 993));
  if (data.imapSsl !== undefined) sanitized.imapSsl = Boolean(data.imapSsl);
  if (data.imapLogin !== undefined) sanitized.imapLogin = String(data.imapLogin).trim();
  if (data.imapPassword !== undefined && data.imapPassword !== "••••••••") {
    sanitized.imapPassword = String(data.imapPassword);
  }
  if (data.smtpHost !== undefined) sanitized.smtpHost = String(data.smtpHost).trim();
  if (data.smtpPort !== undefined) sanitized.smtpPort = Math.max(1, Math.min(65535, Number(data.smtpPort) || 587));
  if (data.smtpSsl !== undefined) sanitized.smtpSsl = Boolean(data.smtpSsl);
  if (data.smtpLogin !== undefined) sanitized.smtpLogin = String(data.smtpLogin).trim();
  if (data.smtpPassword !== undefined && data.smtpPassword !== "••••••••") {
    sanitized.smtpPassword = String(data.smtpPassword);
  }
  if (data.fromName !== undefined) sanitized.fromName = String(data.fromName).trim();
  if (data.fromEmail !== undefined) sanitized.fromEmail = String(data.fromEmail).trim();
  if (data.isEnabled !== undefined) sanitized.isEnabled = Boolean(data.isEnabled);

  const config = await actualDb.emailConfig.upsert({
    where: { userId },
    create: { userId, ...sanitized },
    update: sanitized,
  });

  return {
    imapHost: config.imapHost,
    imapPort: config.imapPort,
    imapSsl: config.imapSsl,
    imapLogin: config.imapLogin,
    imapPassword: config.imapPassword,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSsl: config.smtpSsl,
    smtpLogin: config.smtpLogin,
    smtpPassword: config.smtpPassword,
    fromName: config.fromName,
    fromEmail: config.fromEmail,
    isEnabled: config.isEnabled,
    lastSyncAt: config.lastSyncAt,
  };
}

export function maskEmailConfig(config: EmailConfigData): EmailConfigData {
  return {
    ...config,
    imapPassword: config.imapPassword ? "••••••••" : "",
    smtpPassword: config.smtpPassword ? "••••••••" : "",
  };
}
