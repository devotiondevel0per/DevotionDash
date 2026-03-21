import { prisma } from "@/lib/prisma";

export const SECURITY_POLICY_KEY = "security.policy.v1";
const LOGIN_ATTEMPT_PREFIX = "security.login.attempt.";

export type SecurityPolicy = {
  ipAllowlist: string[];
  ipBlocklist: string[];
  countryAllowlist: string[];
  countryBlocklist: string[];
  loginRateLimit: {
    maxAttempts: number;
    windowMinutes: number;
    lockMinutes: number;
  };
  passwordPolicy: {
    minLength: number;
    requireUpper: boolean;
    requireLower: boolean;
    requireNumber: boolean;
    requireSymbol: boolean;
  };
  enforce2FAForAdmins: boolean;
  sessionMaxMinutes: number;
};

type LoginAttemptState = {
  count: number;
  firstFailedAt: string;
  blockedUntil: string | null;
};

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  ipAllowlist: [],
  ipBlocklist: [],
  countryAllowlist: [],
  countryBlocklist: [],
  loginRateLimit: {
    maxAttempts: 8,
    windowMinutes: 10,
    lockMinutes: 20,
  },
  passwordPolicy: {
    minLength: 10,
    requireUpper: true,
    requireLower: true,
    requireNumber: true,
    requireSymbol: false,
  },
  enforce2FAForAdmins: false,
  sessionMaxMinutes: 60 * 24 * 7,
};

function normalizeList(values: unknown, upper = false): string[] {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .map((value) => (upper ? value.toUpperCase() : value));
  return Array.from(new Set(normalized));
}

function toPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

export function parseSecurityPolicy(raw: string | null | undefined): SecurityPolicy {
  if (!raw) return { ...DEFAULT_SECURITY_POLICY };
  try {
    const parsed = JSON.parse(raw) as Partial<SecurityPolicy>;
    return {
      ipAllowlist: normalizeList(parsed.ipAllowlist),
      ipBlocklist: normalizeList(parsed.ipBlocklist),
      countryAllowlist: normalizeList(parsed.countryAllowlist, true),
      countryBlocklist: normalizeList(parsed.countryBlocklist, true),
      loginRateLimit: {
        maxAttempts: toPositiveInt(parsed.loginRateLimit?.maxAttempts, DEFAULT_SECURITY_POLICY.loginRateLimit.maxAttempts, 1, 50),
        windowMinutes: toPositiveInt(parsed.loginRateLimit?.windowMinutes, DEFAULT_SECURITY_POLICY.loginRateLimit.windowMinutes, 1, 120),
        lockMinutes: toPositiveInt(parsed.loginRateLimit?.lockMinutes, DEFAULT_SECURITY_POLICY.loginRateLimit.lockMinutes, 1, 240),
      },
      passwordPolicy: {
        minLength: toPositiveInt(parsed.passwordPolicy?.minLength, DEFAULT_SECURITY_POLICY.passwordPolicy.minLength, 8, 128),
        requireUpper: parsed.passwordPolicy?.requireUpper ?? DEFAULT_SECURITY_POLICY.passwordPolicy.requireUpper,
        requireLower: parsed.passwordPolicy?.requireLower ?? DEFAULT_SECURITY_POLICY.passwordPolicy.requireLower,
        requireNumber: parsed.passwordPolicy?.requireNumber ?? DEFAULT_SECURITY_POLICY.passwordPolicy.requireNumber,
        requireSymbol: parsed.passwordPolicy?.requireSymbol ?? DEFAULT_SECURITY_POLICY.passwordPolicy.requireSymbol,
      },
      enforce2FAForAdmins: parsed.enforce2FAForAdmins ?? DEFAULT_SECURITY_POLICY.enforce2FAForAdmins,
      sessionMaxMinutes: toPositiveInt(parsed.sessionMaxMinutes, DEFAULT_SECURITY_POLICY.sessionMaxMinutes, 15, 60 * 24 * 30),
    };
  } catch {
    return { ...DEFAULT_SECURITY_POLICY };
  }
}

export function serializeSecurityPolicy(policy: SecurityPolicy): string {
  return JSON.stringify({
    ...policy,
    ipAllowlist: normalizeList(policy.ipAllowlist),
    ipBlocklist: normalizeList(policy.ipBlocklist),
    countryAllowlist: normalizeList(policy.countryAllowlist, true),
    countryBlocklist: normalizeList(policy.countryBlocklist, true),
  });
}

export async function getSecurityPolicy(): Promise<SecurityPolicy> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: SECURITY_POLICY_KEY },
    select: { value: true },
  });
  return parseSecurityPolicy(row?.value);
}

export function parseListFromText(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

export function getRequestIp(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const value = forwarded.split(",")[0]?.trim();
    if (value) return value;
  }
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? null;
}

export function getRequestCountry(headers: { get(name: string): string | null }): string | null {
  const fromVercel = headers.get("x-vercel-ip-country");
  if (fromVercel) return fromVercel.toUpperCase();
  const fromCloudflare = headers.get("cf-ipcountry");
  if (fromCloudflare) return fromCloudflare.toUpperCase();
  return null;
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return null;
  return ((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3];
}

function ipMatchesRule(ip: string, rule: string): boolean {
  const trimmed = rule.trim();
  if (!trimmed) return false;
  if (!trimmed.includes("/")) return ip === trimmed;

  const [baseIp, maskRaw] = trimmed.split("/");
  const maskBits = Number(maskRaw);
  if (!Number.isInteger(maskBits) || maskBits < 0 || maskBits > 32) return false;

  const ipNum = ipv4ToNumber(ip);
  const baseNum = ipv4ToNumber(baseIp);
  if (ipNum === null || baseNum === null) return false;

  const mask = maskBits === 0 ? 0 : ((0xffffffff << (32 - maskBits)) >>> 0);
  return (ipNum & mask) === (baseNum & mask);
}

export function evaluateNetworkAccess(
  policy: SecurityPolicy,
  input: { ip: string | null; country: string | null }
): { allowed: boolean; reason?: string } {
  const ip = input.ip?.trim() ?? "";
  const country = input.country?.trim().toUpperCase() ?? "";

  if (policy.ipAllowlist.length > 0) {
    if (!ip || !policy.ipAllowlist.some((rule) => ipMatchesRule(ip, rule))) {
      return { allowed: false, reason: "ip_not_allowlisted" };
    }
  }

  if (ip && policy.ipBlocklist.some((rule) => ipMatchesRule(ip, rule))) {
    return { allowed: false, reason: "ip_blocked" };
  }

  if (policy.countryAllowlist.length > 0) {
    if (!country || !policy.countryAllowlist.includes(country)) {
      return { allowed: false, reason: "country_not_allowlisted" };
    }
  }

  if (country && policy.countryBlocklist.includes(country)) {
    return { allowed: false, reason: "country_blocked" };
  }

  return { allowed: true };
}

function attemptKey(login: string, ip: string | null): string {
  const raw = `${login.toLowerCase().trim()}|${ip ?? "unknown"}`;
  return Buffer.from(raw).toString("base64url");
}

async function getAttemptRow(key: string) {
  return prisma.systemSetting.findUnique({
    where: { key: `${LOGIN_ATTEMPT_PREFIX}${key}` },
    select: { value: true },
  });
}

function parseAttemptState(raw: string | null | undefined): LoginAttemptState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LoginAttemptState>;
    if (!parsed.firstFailedAt || typeof parsed.count !== "number") return null;
    return {
      count: Math.max(0, Math.floor(parsed.count)),
      firstFailedAt: parsed.firstFailedAt,
      blockedUntil: parsed.blockedUntil ?? null,
    };
  } catch {
    return null;
  }
}

export async function isLoginBlocked(login: string, ip: string | null) {
  const key = attemptKey(login, ip);
  const row = await getAttemptRow(key);
  const state = parseAttemptState(row?.value);
  if (!state?.blockedUntil) return { blocked: false as const };
  const blockedUntilMs = Date.parse(state.blockedUntil);
  if (Number.isNaN(blockedUntilMs) || blockedUntilMs <= Date.now()) {
    await prisma.systemSetting.deleteMany({ where: { key: `${LOGIN_ATTEMPT_PREFIX}${key}` } });
    return { blocked: false as const };
  }
  return { blocked: true as const, blockedUntil: state.blockedUntil };
}

export async function recordLoginFailure(login: string, ip: string | null, policy: SecurityPolicy) {
  const key = attemptKey(login, ip);
  const now = new Date();
  const row = await getAttemptRow(key);
  const current = parseAttemptState(row?.value);

  const windowMs = policy.loginRateLimit.windowMinutes * 60 * 1000;
  const firstFailedAtMs = current?.firstFailedAt ? Date.parse(current.firstFailedAt) : Number.NaN;
  const inWindow = Number.isFinite(firstFailedAtMs) && now.getTime() - firstFailedAtMs <= windowMs;

  const count = inWindow ? (current?.count ?? 0) + 1 : 1;
  const firstFailedAt = inWindow && current?.firstFailedAt ? current.firstFailedAt : now.toISOString();
  const blockedUntil =
    count >= policy.loginRateLimit.maxAttempts
      ? new Date(now.getTime() + policy.loginRateLimit.lockMinutes * 60 * 1000).toISOString()
      : null;

  const payload: LoginAttemptState = {
    count,
    firstFailedAt,
    blockedUntil,
  };

  await prisma.systemSetting.upsert({
    where: { key: `${LOGIN_ATTEMPT_PREFIX}${key}` },
    create: { key: `${LOGIN_ATTEMPT_PREFIX}${key}`, value: JSON.stringify(payload) },
    update: { value: JSON.stringify(payload) },
  });
}

export async function clearLoginFailures(login: string, ip: string | null) {
  const key = attemptKey(login, ip);
  await prisma.systemSetting.deleteMany({ where: { key: `${LOGIN_ATTEMPT_PREFIX}${key}` } });
}

export function validatePasswordWithPolicy(password: string, policy: SecurityPolicy): string | null {
  if (password.length < policy.passwordPolicy.minLength) {
    return `Password must be at least ${policy.passwordPolicy.minLength} characters.`;
  }
  if (policy.passwordPolicy.requireUpper && !/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (policy.passwordPolicy.requireLower && !/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }
  if (policy.passwordPolicy.requireNumber && !/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  if (policy.passwordPolicy.requireSymbol && !/[^a-zA-Z0-9]/.test(password)) {
    return "Password must include at least one symbol.";
  }
  return null;
}
