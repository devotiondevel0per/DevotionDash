import { headers } from "next/headers";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { getTenantClient } from "./tenant-client";

/**
 * Returns the correct Prisma client for the current request.
 * - If request carries x-tenant-id header → returns that tenant's DB client
 * - Otherwise → returns platform DB client
 *
 * Use this in API route handlers only (not middleware, not edge functions).
 */
export async function getDb(): Promise<PrismaClient> {
  try {
    const hdrs = await headers();
    const tenantId = hdrs.get("x-tenant-id");
    if (tenantId) return getTenantClient(tenantId);
  } catch {
    // Outside request context (scripts, tests) — fall back to platform DB
  }
  return prisma;
}
