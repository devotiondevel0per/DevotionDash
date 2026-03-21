import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const IMPERSONATION_KEY_PREFIX = "impersonate.token.";
const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function createImpersonationToken(
  adminId: string,
  targetUserId: string
): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const key = `${IMPERSONATION_KEY_PREFIX}${token}`;
  const value = JSON.stringify({
    adminId,
    targetUserId,
    createdAt: Date.now(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });

  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });

  return token;
}

export async function validateImpersonationToken(token: string): Promise<{
  adminId: string;
  targetUserId: string;
} | null> {
  if (!token || token.length !== 64) return null;

  const key = `${IMPERSONATION_KEY_PREFIX}${token}`;

  try {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    if (!row) return null;

    const data = JSON.parse(row.value) as {
      adminId: string;
      targetUserId: string;
      expiresAt: number;
    };

    // Always delete after reading (one-time use)
    await prisma.systemSetting.delete({ where: { key } });

    if (Date.now() > data.expiresAt) return null;

    return { adminId: data.adminId, targetUserId: data.targetUserId };
  } catch {
    return null;
  }
}

// Cleanup expired impersonation tokens
export async function cleanupExpiredImpersonationTokens(): Promise<void> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { startsWith: IMPERSONATION_KEY_PREFIX } },
  });
  const now = Date.now();
  const expiredKeys: string[] = [];
  for (const row of rows) {
    try {
      const data = JSON.parse(row.value) as { expiresAt: number };
      if (now > data.expiresAt) expiredKeys.push(row.key);
    } catch {
      expiredKeys.push(row.key);
    }
  }
  if (expiredKeys.length > 0) {
    await prisma.systemSetting.deleteMany({ where: { key: { in: expiredKeys } } });
  }
}
