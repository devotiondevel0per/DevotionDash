/**
 * Resolves tenant from request Host header.
 * Results are cached in-memory with TTL to avoid DB queries on every request.
 */
import { prisma } from "./prisma";

export type TenantRecord = {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan: string;
  maxUsers: number;
  defaultDomain: string;
  customDomain: string | null;
  databaseUrl: string;
  brandName: string | null;
  brandLogoUrl: string | null;
  brandColors: string | null;
};

type CacheEntry = { tenant: TenantRecord | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 3 * 60 * 1000; // 3 minutes

const SELECT = {
  id: true, slug: true, name: true, status: true, plan: true, maxUsers: true,
  defaultDomain: true, customDomain: true, databaseUrl: true,
  brandName: true, brandLogoUrl: true, brandColors: true,
} as const;

export async function getTenantByDomain(host: string): Promise<TenantRecord | null> {
  const clean = host.toLowerCase().split(":")[0];
  const now = Date.now();
  const cached = cache.get(clean);
  if (cached && cached.expiresAt > now) return cached.tenant;

  let tenant: TenantRecord | null = null;
  try {
    tenant = await prisma.tenant.findFirst({
      where: { OR: [{ customDomain: clean }, { defaultDomain: clean }] },
      select: SELECT,
    });
  } catch {
    // DB unavailable — return cached stale if available
    return cached?.tenant ?? null;
  }

  cache.set(clean, { tenant, expiresAt: now + TTL_MS });
  return tenant;
}

export async function getTenantById(id: string): Promise<TenantRecord | null> {
  return prisma.tenant.findUnique({ where: { id }, select: SELECT });
}

export function invalidateTenantCache(host?: string) {
  if (host) cache.delete(host.toLowerCase());
  else cache.clear();
}

/** Check if a host is a known tenant domain (not the platform). */
export function isPlatformDomain(host: string): boolean {
  const platformDomain = process.env.PLATFORM_DOMAIN ?? "";
  const clean = host.toLowerCase().split(":")[0];
  // Raw IP addresses are always the platform — never a tenant domain
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) return true;
  if (clean === "localhost" || clean === "127.0.0.1") return true;
  if (!platformDomain) return false;
  return clean === platformDomain || clean.endsWith(`.${platformDomain}`);
}
