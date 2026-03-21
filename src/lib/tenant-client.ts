/**
 * Dynamic Prisma client factory for multi-tenant architecture.
 * Each tenant has their own MySQL database. This module creates and caches
 * Prisma clients per tenant, reusing them across requests.
 */
import { PrismaClient } from "@prisma/client";
import { prisma as platformPrisma } from "./prisma";

type CacheEntry = { client: PrismaClient; lastUsed: number };
const clientCache = new Map<string, CacheEntry>();
const IDLE_TTL_MS = 15 * 60 * 1000; // evict after 15 min idle
const MAX_CACHE = 200;

function evictIdle() {
  const now = Date.now();
  for (const [key, entry] of clientCache) {
    if (now - entry.lastUsed > IDLE_TTL_MS) {
      void entry.client.$disconnect().catch(() => {});
      clientCache.delete(key);
    }
  }
}

function makeClient(dbUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: dbUrl } },
    log: process.env.NODE_ENV === "development" ? ["error"] : ["error"],
  });
}

/**
 * Get (or create) a Prisma client for the given tenant's database.
 * Looks up the tenant's databaseUrl from the platform DB, then caches the client.
 */
export async function getTenantClient(tenantId: string): Promise<PrismaClient> {
  const now = Date.now();
  const cached = clientCache.get(tenantId);
  if (cached) {
    cached.lastUsed = now;
    return cached.client;
  }

  const tenant = await platformPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { databaseUrl: true, status: true },
  });
  if (!tenant) throw new Error(`Tenant '${tenantId}' not found in registry`);
  if (tenant.status === "suspended" || tenant.status === "cancelled") {
    throw new Error(`Tenant '${tenantId}' is ${tenant.status}`);
  }

  if (clientCache.size >= MAX_CACHE) evictIdle();

  const client = makeClient(tenant.databaseUrl);
  clientCache.set(tenantId, { client, lastUsed: now });
  return client;
}

/**
 * Get a Prisma client directly from a database URL (used during login/setup).
 * These short-lived clients are NOT cached.
 */
export function getTenantClientByUrl(dbUrl: string): PrismaClient {
  return makeClient(dbUrl);
}

/** Remove a tenant's client from cache (call after status change). */
export function invalidateTenantClient(tenantId: string) {
  const entry = clientCache.get(tenantId);
  if (entry) {
    void entry.client.$disconnect().catch(() => {});
    clientCache.delete(tenantId);
  }
}
