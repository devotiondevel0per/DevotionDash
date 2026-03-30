import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { invalidateTenantCache } from "@/lib/tenant-registry";
import { invalidateTenantClient } from "@/lib/tenant-client";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

type RouteCtx = { params: Promise<{ id: string }> };

async function requirePlatformAdmin() {
  const hdrs = await headers();
  if (hdrs.get("x-tenant-id")) return null;
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } });
  return user?.isAdmin ? session.user.id : null;
}

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const adminId = await requirePlatformAdmin();
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { id }, include: { subscription: true } });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(tenant);
}

export async function PUT(req: NextRequest, { params }: RouteCtx) {
  const adminId = await requirePlatformAdmin();
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json() as Record<string, unknown>;
  if (body.maxUsers !== undefined) {
    const maxUsers = Number(body.maxUsers);
    if (!Number.isInteger(maxUsers) || maxUsers < 1) {
      return NextResponse.json({ error: "maxUsers must be a positive integer" }, { status: 400 });
    }
  }
  if (body.adminEmail !== undefined) {
    const adminEmail = String(body.adminEmail).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      return NextResponse.json({ error: "adminEmail must be a valid email address" }, { status: 400 });
    }
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: String(body.name) }),
      ...(body.customDomain !== undefined && { customDomain: body.customDomain ? String(body.customDomain).toLowerCase() : null }),
      ...(body.defaultDomain !== undefined && { defaultDomain: String(body.defaultDomain).toLowerCase() }),
      ...(body.status !== undefined && { status: String(body.status) }),
      ...(body.plan !== undefined && { plan: String(body.plan) }),
      ...(body.maxUsers !== undefined && { maxUsers: Number(body.maxUsers) }),
      ...(body.databaseUrl !== undefined && { databaseUrl: String(body.databaseUrl) }),
      ...(body.adminEmail !== undefined && { adminEmail: String(body.adminEmail).trim().toLowerCase() }),
      ...(body.notes !== undefined && { notes: body.notes ? String(body.notes) : null }),
      ...(body.brandName !== undefined && { brandName: body.brandName ? String(body.brandName) : null }),
      ...(body.brandLogoUrl !== undefined && { brandLogoUrl: body.brandLogoUrl ? String(body.brandLogoUrl) : null }),
      ...(body.trialEndsAt !== undefined && { trialEndsAt: body.trialEndsAt ? new Date(String(body.trialEndsAt)) : null }),
    },
    include: { subscription: true },
  });

  // Update subscription if billing fields provided
  if (body.billing && typeof body.billing === "object") {
    const billing = body.billing as Record<string, unknown>;
    await prisma.tenantSubscription.upsert({
      where: { tenantId: id },
      create: {
        tenantId: id,
        billingType: String(billing.billingType ?? "per_user_monthly"),
        pricePerUser: billing.pricePerUser != null ? Number(billing.pricePerUser) : null,
        flatPrice: billing.flatPrice != null ? Number(billing.flatPrice) : null,
        currency: String(billing.currency ?? "USD"),
        userLimit: Number(billing.userLimit ?? 10),
        nextBillingAt: billing.nextBillingAt ? new Date(String(billing.nextBillingAt)) : null,
        lastBilledAt: billing.lastBilledAt ? new Date(String(billing.lastBilledAt)) : null,
        status: String(billing.status ?? "active"),
        notes: billing.notes ? String(billing.notes) : null,
      },
      update: {
        ...(billing.billingType !== undefined && { billingType: String(billing.billingType) }),
        ...(billing.pricePerUser !== undefined && { pricePerUser: billing.pricePerUser != null ? Number(billing.pricePerUser) : null }),
        ...(billing.flatPrice !== undefined && { flatPrice: billing.flatPrice != null ? Number(billing.flatPrice) : null }),
        ...(billing.currency !== undefined && { currency: String(billing.currency) }),
        ...(billing.userLimit !== undefined && { userLimit: Number(billing.userLimit) }),
        ...(billing.nextBillingAt !== undefined && { nextBillingAt: billing.nextBillingAt ? new Date(String(billing.nextBillingAt)) : null }),
        ...(billing.lastBilledAt !== undefined && { lastBilledAt: billing.lastBilledAt ? new Date(String(billing.lastBilledAt)) : null }),
        ...(billing.status !== undefined && { status: String(billing.status) }),
        ...(billing.notes !== undefined && { notes: billing.notes ? String(billing.notes) : null }),
      },
    });
  }

  invalidateTenantCache();
  invalidateTenantClient(id);

  await writeAuditLog({
    userId: adminId,
    action: "TENANT_UPDATED",
    module: "administration",
    targetId: id,
    details: JSON.stringify({
      name: tenant.name,
      status: tenant.status,
      plan: tenant.plan,
      maxUsers: tenant.maxUsers,
    }),
    ipAddress: getClientIpAddress(req),
  });

  return NextResponse.json(tenant);
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const adminId = await requirePlatformAdmin();
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const existing = await prisma.tenant.findUnique({ where: { id }, select: { id: true, slug: true, name: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.tenant.delete({ where: { id } });
  invalidateTenantCache();
  invalidateTenantClient(id);

  await writeAuditLog({
    userId: adminId,
    action: "TENANT_DELETED",
    module: "administration",
    targetId: id,
    details: JSON.stringify({ slug: existing.slug, name: existing.name }),
    ipAddress: getClientIpAddress(_req),
  });

  return NextResponse.json({ ok: true });
}
