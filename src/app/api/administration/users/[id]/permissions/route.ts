import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  USER_PERMISSION_OVERRIDE_PREFIX,
  type UserPermissionOverrideMode,
  parseRolePermissionConfig,
  parseUserPermissionOverrideSetting,
  toUserPermissionOverrideSetting,
} from "@/lib/admin-config";
import { writeAuditLog, getClientIpAddress } from "@/lib/audit-log";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, fullname: true, name: true, surname: true, email: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const key = `${USER_PERMISSION_OVERRIDE_PREFIX}${id}`;
    const setting = await prisma.systemSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    const override = parseUserPermissionOverrideSetting(setting?.value);

    return NextResponse.json({
      user: {
        id: user.id,
        fullname: user.fullname || `${user.name} ${user.surname}`.trim(),
        email: user.email,
      },
      mode: override?.mode ?? "replace",
      grants: override?.grants ?? {},
      denies: override?.denies ?? {},
    });
  } catch (error) {
    console.error("[GET /api/administration/users/[id]/permissions]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const body = (await req.json()) as {
      mode?: unknown;
      grants?: unknown;
      denies?: unknown;
    };
    const mode: UserPermissionOverrideMode = body.mode === "merge" ? "merge" : "replace";
    const grants = parseRolePermissionConfig(body.grants);
    const denies = parseRolePermissionConfig(body.denies);
    const key = `${USER_PERMISSION_OVERRIDE_PREFIX}${id}`;

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (!grants && !denies) {
      await prisma.systemSetting.deleteMany({ where: { key } });
    } else {
      await prisma.systemSetting.upsert({
        where: { key },
        create: { key, value: toUserPermissionOverrideSetting({ mode, grants, denies }) },
        update: { value: toUserPermissionOverrideSetting({ mode, grants, denies }) },
      });
    }

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "USER_PERMISSION_OVERRIDE_UPDATED",
      module: "administration",
      targetId: id,
      details: JSON.stringify({ mode, grants: grants ?? {}, denies: denies ?? {} }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({ success: true, mode, grants: grants ?? {}, denies: denies ?? {} });
  } catch (error) {
    console.error("[PUT /api/administration/users/[id]/permissions]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
