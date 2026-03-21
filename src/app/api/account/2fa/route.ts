import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  disableUserTwoFactor,
  enableOrRotateUserTwoFactor,
  getUserTwoFactorState,
  regenerateBackupCodes,
} from "@/lib/user-2fa";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";
import { getServerBranding } from "@/lib/branding-server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        login: true,
        email: true,
        fullname: true,
        name: true,
        surname: true,
      },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const state = await getUserTwoFactorState(user.id);
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
    console.error("[GET /api/account/2fa]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        login: true,
        email: true,
      },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = (await req.json()) as { action?: "enable" | "disable" | "rotate" | "backup" };
    const action = body.action;
    if (!action) return NextResponse.json({ error: "Action is required" }, { status: 400 });

    if (action === "disable") {
      await disableUserTwoFactor(user.id);
      await writeAuditLog({
        userId: user.id,
        action: "SELF_2FA_DISABLED",
        module: "profile",
        details: JSON.stringify({ login: user.login, email: user.email }),
        ipAddress: getClientIpAddress(req),
      });
      return NextResponse.json({ ok: true, enabled: false });
    }

    if (action === "backup") {
      const backup = await regenerateBackupCodes(user.id);
      if (!backup.state) {
        return NextResponse.json({ error: "2FA is not enabled for this user" }, { status: 400 });
      }
      await writeAuditLog({
        userId: user.id,
        action: "SELF_2FA_BACKUP_ROTATED",
        module: "profile",
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
      userId: user.id,
      issuer: branding.appName,
      accountName: identity,
      forceRotate: action === "rotate",
    });

    await writeAuditLog({
      userId: user.id,
      action: action === "rotate" ? "SELF_2FA_ROTATED" : "SELF_2FA_ENABLED",
      module: "profile",
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
    console.error("[PUT /api/account/2fa]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
