import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { disableUserTwoFactor, enableOrRotateUserTwoFactor, getUserTwoFactorState, regenerateBackupCodes } from "@/lib/user-2fa";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";
import { getServerBranding } from "@/lib/branding-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, login: true, email: true, fullname: true, name: true, surname: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const state = await getUserTwoFactorState(id);

    return NextResponse.json({
      enabled: state?.enabled ?? false,
      backupCodesRemaining: state?.backupCodeHashes.length ?? 0,
      updatedAt: state?.updatedAt ?? null,
      hasSecret: Boolean(state?.secret),
      user: {
        id: user.id,
        login: user.login,
        email: user.email,
        name: user.fullname || `${user.name} ${user.surname}`.trim(),
      },
    });
  } catch (error) {
    console.error("[GET /api/administration/users/[id]/2fa]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, login: true, email: true, fullname: true, name: true, surname: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = (await req.json()) as { action?: "enable" | "disable" | "rotate" | "backup" };
    const action = body.action;
    if (!action) return NextResponse.json({ error: "Action is required" }, { status: 400 });

    if (action === "disable") {
      await disableUserTwoFactor(id);
      await writeAuditLog({
        userId: accessResult.ctx.userId,
        action: "USER_2FA_DISABLED",
        module: "administration",
        targetId: id,
        details: JSON.stringify({ login: user.login, email: user.email }),
        ipAddress: getClientIpAddress(req),
      });
      return NextResponse.json({ ok: true, enabled: false });
    }

    if (action === "backup") {
      const backup = await regenerateBackupCodes(id);
      if (!backup.state) {
        return NextResponse.json({ error: "2FA is not enabled for this user" }, { status: 400 });
      }
      await writeAuditLog({
        userId: accessResult.ctx.userId,
        action: "USER_2FA_BACKUP_ROTATED",
        module: "administration",
        targetId: id,
        details: JSON.stringify({ login: user.login, email: user.email }),
        ipAddress: getClientIpAddress(req),
      });
      return NextResponse.json({
        ok: true,
        enabled: true,
        backupCodes: backup.backupCodes,
      });
    }

    const identity = user.email || user.login;
    const branding = await getServerBranding();
    const result = await enableOrRotateUserTwoFactor({
      userId: id,
      issuer: branding.appName,
      accountName: identity,
      forceRotate: action === "rotate",
    });

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: action === "rotate" ? "USER_2FA_ROTATED" : "USER_2FA_ENABLED",
      module: "administration",
      targetId: id,
      details: JSON.stringify({
        login: user.login,
        email: user.email,
        backupCodes: result.backupCodes.length,
      }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({
      ok: true,
      enabled: true,
      secret: result.secret,
      otpAuthUri: result.otpAuthUri,
      backupCodes: result.backupCodes,
      backupCodesRemaining: result.state.backupCodeHashes.length,
    });
  } catch (error) {
    console.error("[PUT /api/administration/users/[id]/2fa]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
