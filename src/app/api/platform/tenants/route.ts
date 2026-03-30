import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { invalidateTenantCache } from "@/lib/tenant-registry";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

/**
 * Platform-only guard.
 * Rejects if request is scoped to a tenant (x-tenant-id header present),
 * or if the session user is not an admin in the platform DB.
 */
async function requirePlatformAdmin() {
  // If the middleware resolved a tenant, this request belongs to a tenant domain — reject
  const hdrs = await headers();
  if (hdrs.get("x-tenant-id")) return null;

  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  return user?.isAdmin ? session.user.id : null;
}

export async function GET() {
  const adminId = await requirePlatformAdmin();
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: { subscription: true },
  });

  return NextResponse.json(tenants);
}

export async function POST(req: NextRequest) {
  const adminId = await requirePlatformAdmin();
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    slug: string;
    name: string;
    defaultDomain: string;
    customDomain?: string;
    databaseUrl: string;
    adminEmail: string;
    plan: string;
    maxUsers: number;
    trialDays?: number;
    notes?: string;
    brandName?: string;
    billingType?: string;
    pricePerUser?: number;
    flatPrice?: number;
    currency?: string;
  };

  if (!body.slug?.trim() || !body.name?.trim() || !body.databaseUrl?.trim() || !body.adminEmail?.trim() || !body.defaultDomain?.trim()) {
    return NextResponse.json({ error: "slug, name, defaultDomain, databaseUrl, and adminEmail are required" }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(body.slug.trim().toLowerCase())) {
    return NextResponse.json({ error: "slug must contain only lowercase letters, numbers, and hyphen" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.adminEmail.trim().toLowerCase())) {
    return NextResponse.json({ error: "adminEmail must be a valid email address" }, { status: 400 });
  }
  if (!Number.isInteger(body.maxUsers) || body.maxUsers < 1) {
    return NextResponse.json({ error: "maxUsers must be a positive integer" }, { status: 400 });
  }

  const trialEndsAt = body.trialDays
    ? new Date(Date.now() + body.trialDays * 86400000)
    : new Date(Date.now() + 14 * 86400000); // default 14-day trial

  const tenant = await prisma.tenant.create({
    data: {
      slug: body.slug.trim().toLowerCase(),
      name: body.name.trim(),
      defaultDomain: body.defaultDomain.trim().toLowerCase(),
      customDomain: body.customDomain?.trim().toLowerCase() || null,
      databaseUrl: body.databaseUrl.trim(),
      adminEmail: body.adminEmail.trim().toLowerCase(),
      plan: body.plan || "basic",
      maxUsers: body.maxUsers || 10,
      status: "trial",
      trialEndsAt,
      notes: body.notes?.trim() || null,
      brandName: body.brandName?.trim() || null,
      subscription: {
        create: {
          billingType: body.billingType || "per_user_monthly",
          pricePerUser: body.pricePerUser ?? null,
          flatPrice: body.flatPrice ?? null,
          currency: body.currency || "USD",
          userLimit: body.maxUsers || 10,
          status: "active",
        },
      },
    },
    include: { subscription: true },
  });

  invalidateTenantCache();
  await writeAuditLog({
    userId: adminId,
    action: "TENANT_CREATED",
    module: "administration",
    targetId: tenant.id,
    details: JSON.stringify({ slug: tenant.slug, name: tenant.name, plan: tenant.plan }),
    ipAddress: getClientIpAddress(req),
  });
  return NextResponse.json(tenant, { status: 201 });
}
