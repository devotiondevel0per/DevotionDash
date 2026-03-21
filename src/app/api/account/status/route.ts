import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildUserAccess } from "@/lib/rbac";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

function normalizeWorkState(value: unknown): 0 | 1 | 2 {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (parsed === 0 || parsed === 1 || parsed === 2) return parsed;
  return 1;
}

function canManagePresence(access: Awaited<ReturnType<typeof buildUserAccess>>) {
  if (!access) return false;
  return (
    access.permissions.chat.read ||
    access.permissions.livechat.read ||
    access.permissions.team.read
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const access = await buildUserAccess(session.user.id);
    if (!canManagePresence(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, workState: true, lastActivity: true, isActive: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({
      workState: normalizeWorkState(user.workState),
      lastActivity: user.lastActivity?.toISOString() ?? null,
      isActive: user.isActive,
    });
  } catch (error) {
    console.error("[GET /api/account/status]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const access = await buildUserAccess(session.user.id);
    if (!canManagePresence(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as { workState?: unknown };
    const workState = normalizeWorkState(body.workState);

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        workState,
        lastActivity: new Date(),
      },
      select: { workState: true, lastActivity: true },
    });

    await writeAuditLog({
      userId: session.user.id,
      action: "USER_STATUS_CHANGED",
      module: "profile",
      details: JSON.stringify({ workState }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({
      success: true,
      workState: normalizeWorkState(updated.workState),
      lastActivity: updated.lastActivity?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("[PUT /api/account/status]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
