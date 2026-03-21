import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { prisma } from "@/lib/prisma";
import { createImpersonationToken } from "@/lib/impersonation";
import { writeAuditLog } from "@/lib/audit-log";
import { headers } from "next/headers";

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  // Only full admins can impersonate
  if (!accessResult.ctx.access.isAdmin) {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { userId?: string };
  if (!body.userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  // Cannot impersonate yourself
  if (body.userId === accessResult.ctx.userId) {
    return NextResponse.json({ error: "Cannot impersonate yourself" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: body.userId },
    select: { id: true, login: true, fullname: true, name: true, isActive: true },
  });

  if (!target || !target.isActive) {
    return NextResponse.json({ error: "User not found or inactive" }, { status: 404 });
  }

  const token = await createImpersonationToken(accessResult.ctx.userId, target.id);
  const ip = (await headers()).get("x-forwarded-for") ?? undefined;

  await writeAuditLog({
    userId: accessResult.ctx.userId,
    action: "ADMIN_IMPERSONATE",
    module: "administration",
    targetId: target.id,
    details: JSON.stringify({
      targetLogin: target.login,
      targetName: target.fullname || target.name,
    }),
    ipAddress: ip,
  });

  // Return redirect URL — the frontend will navigate to this
  return NextResponse.json({
    token,
    targetUser: {
      id: target.id,
      login: target.login,
      name: target.fullname || target.name,
    },
    loginUrl: `/api/auth/callback/credentials`,
    // The client should use this to trigger a NextAuth signIn with the impersonation credentials
  });
}
