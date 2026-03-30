import { prisma } from "@/lib/prisma";
import { buildOtpAuthUri, generateBackupCodes, generateTotpSecret, hashBackupCode, verifyTotpCode } from "@/lib/two-factor";
import type { PrismaClient } from "@prisma/client";

const USER_2FA_PREFIX = "security.2fa.user.";

export type UserTwoFactorState = {
  enabled: boolean;
  secret: string;
  backupCodeHashes: string[];
  createdAt: string;
  updatedAt: string;
};

type EnableResult = {
  state: UserTwoFactorState;
  secret: string;
  backupCodes: string[];
  otpAuthUri: string;
};

function parseState(raw: string | null | undefined): UserTwoFactorState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UserTwoFactorState>;
    if (!parsed.secret || !Array.isArray(parsed.backupCodeHashes)) return null;
    return {
      enabled: parsed.enabled ?? true,
      secret: parsed.secret,
      backupCodeHashes: parsed.backupCodeHashes.map((value) => String(value)),
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function keyForUser(userId: string) {
  return `${USER_2FA_PREFIX}${userId}`;
}

export async function getUserTwoFactorState(userId: string, db?: PrismaClient): Promise<UserTwoFactorState | null> {
  const actualDb = db ?? prisma;
  const row = await actualDb.systemSetting.findUnique({
    where: { key: keyForUser(userId) },
    select: { value: true },
  });
  return parseState(row?.value);
}

async function saveUserTwoFactorState(userId: string, state: UserTwoFactorState, db?: PrismaClient) {
  const actualDb = db ?? prisma;
  await actualDb.systemSetting.upsert({
    where: { key: keyForUser(userId) },
    create: { key: keyForUser(userId), value: JSON.stringify(state) },
    update: { value: JSON.stringify(state) },
  });
}

export async function disableUserTwoFactor(userId: string, db?: PrismaClient) {
  const actualDb = db ?? prisma;
  await actualDb.systemSetting.deleteMany({ where: { key: keyForUser(userId) } });
}

export async function enableOrRotateUserTwoFactor(input: {
  userId: string;
  issuer: string;
  accountName: string;
  forceRotate?: boolean;
  db?: PrismaClient;
}): Promise<EnableResult> {
  const existing = await getUserTwoFactorState(input.userId, input.db);
  const secret = !input.forceRotate && existing?.secret ? existing.secret : generateTotpSecret();
  const backupCodes = generateBackupCodes(8);
  const nowIso = new Date().toISOString();

  const state: UserTwoFactorState = {
    enabled: true,
    secret,
    backupCodeHashes: backupCodes.map(hashBackupCode),
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };

  await saveUserTwoFactorState(input.userId, state, input.db);

  return {
    state,
    secret,
    backupCodes,
    otpAuthUri: buildOtpAuthUri({
      issuer: input.issuer,
      accountName: input.accountName,
      secret,
    }),
  };
}

export async function regenerateBackupCodes(
  userId: string,
  db?: PrismaClient
): Promise<{ backupCodes: string[]; state: UserTwoFactorState | null }> {
  const existing = await getUserTwoFactorState(userId, db);
  if (!existing || !existing.secret) return { backupCodes: [], state: null };

  const backupCodes = generateBackupCodes(8);
  const nextState: UserTwoFactorState = {
    ...existing,
    backupCodeHashes: backupCodes.map(hashBackupCode),
    updatedAt: new Date().toISOString(),
  };
  await saveUserTwoFactorState(userId, nextState, db);

  return { backupCodes, state: nextState };
}

export async function verifyAndConsumeTwoFactorCode(
  userId: string,
  code: string,
  db?: PrismaClient
): Promise<boolean> {
  const state = await getUserTwoFactorState(userId, db);
  if (!state?.enabled || !state.secret) return false;

  if (verifyTotpCode(state.secret, code)) return true;

  const hashed = hashBackupCode(code);
  if (!state.backupCodeHashes.includes(hashed)) return false;

  const nextState: UserTwoFactorState = {
    ...state,
    backupCodeHashes: state.backupCodeHashes.filter((item) => item !== hashed),
    updatedAt: new Date().toISOString(),
  };
  await saveUserTwoFactorState(userId, nextState, db);
  return true;
}
