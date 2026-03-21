import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const PASSWORD_RESET_TOKEN_PREFIX = "security.passwordReset.token.";
const PASSWORD_RESET_USER_PREFIX = "security.passwordReset.user.";
const DEFAULT_RESET_TTL_MINUTES = 30;

type PasswordResetTokenPayload = {
  userId: string;
  createdAt: string;
  expiresAt: string;
};

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function tokenKeyByHash(tokenHash: string) {
  return `${PASSWORD_RESET_TOKEN_PREFIX}${tokenHash}`;
}

function userKey(userId: string) {
  return `${PASSWORD_RESET_USER_PREFIX}${userId}`;
}

function parsePayload(raw: string | null | undefined): PasswordResetTokenPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PasswordResetTokenPayload>;
    if (!parsed.userId || !parsed.expiresAt || !parsed.createdAt) return null;
    return {
      userId: String(parsed.userId),
      createdAt: String(parsed.createdAt),
      expiresAt: String(parsed.expiresAt),
    };
  } catch {
    return null;
  }
}

export async function cleanupExpiredPasswordResetTokens() {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { startsWith: PASSWORD_RESET_TOKEN_PREFIX } },
    select: { key: true, value: true },
    take: 500,
  });
  const now = Date.now();
  const keysToDelete: string[] = [];
  for (const row of rows) {
    const payload = parsePayload(row.value);
    if (!payload) {
      keysToDelete.push(row.key);
      continue;
    }
    const expiryMs = Date.parse(payload.expiresAt);
    if (Number.isNaN(expiryMs) || expiryMs <= now) keysToDelete.push(row.key);
  }
  if (keysToDelete.length > 0) {
    await prisma.systemSetting.deleteMany({ where: { key: { in: keysToDelete } } });
  }
}

export async function createPasswordResetToken(userId: string, ttlMinutes = DEFAULT_RESET_TTL_MINUTES) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  const userIndexKey = userKey(userId);
  const existing = await prisma.systemSetting.findUnique({
    where: { key: userIndexKey },
    select: { value: true },
  });
  const existingHash = existing?.value?.trim();

  await prisma.$transaction(async (tx) => {
    if (existingHash) {
      await tx.systemSetting.deleteMany({
        where: { key: tokenKeyByHash(existingHash) },
      });
    }

    await tx.systemSetting.upsert({
      where: { key: tokenKeyByHash(tokenHash) },
      create: {
        key: tokenKeyByHash(tokenHash),
        value: JSON.stringify({
          userId,
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        } satisfies PasswordResetTokenPayload),
      },
      update: {
        value: JSON.stringify({
          userId,
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        } satisfies PasswordResetTokenPayload),
      },
    });

    await tx.systemSetting.upsert({
      where: { key: userIndexKey },
      create: { key: userIndexKey, value: tokenHash },
      update: { value: tokenHash },
    });
  });

  return {
    token: rawToken,
    tokenHash,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function resolvePasswordResetToken(rawToken: string) {
  const token = rawToken.trim();
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = await prisma.systemSetting.findUnique({
    where: { key: tokenKeyByHash(tokenHash) },
    select: { key: true, value: true },
  });
  const payload = parsePayload(row?.value);
  if (!payload) return null;

  const expiryMs = Date.parse(payload.expiresAt);
  if (Number.isNaN(expiryMs) || expiryMs <= Date.now()) {
    await consumePasswordResetTokenByHash(tokenHash, payload.userId);
    return null;
  }

  return {
    userId: payload.userId,
    tokenHash,
    expiresAt: payload.expiresAt,
    createdAt: payload.createdAt,
  };
}

export async function consumePasswordResetTokenByHash(tokenHash: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.deleteMany({ where: { key: tokenKeyByHash(tokenHash) } });
    await tx.systemSetting.deleteMany({ where: { key: userKey(userId) } });
  });
}

