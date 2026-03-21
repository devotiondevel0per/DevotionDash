import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";
import { consumePasswordResetTokenByHash, resolvePasswordResetToken } from "@/lib/password-reset";
import { getSecurityPolicy, validatePasswordWithPolicy } from "@/lib/security-policy";

function readToken(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(req: NextRequest) {
  const token = readToken(req.nextUrl.searchParams.get("token"));
  if (!token) {
    return NextResponse.json({ valid: false });
  }
  const resolved = await resolvePasswordResetToken(token);
  if (!resolved) {
    return NextResponse.json({ valid: false });
  }
  return NextResponse.json({
    valid: true,
    expiresAt: resolved.expiresAt,
  });
}

export async function POST(req: NextRequest) {
  const ipAddress = getClientIpAddress(req);
  try {
    const body = (await req.json()) as { token?: string; password?: string };
    const token = readToken(body.token);
    const password = typeof body.password === "string" ? body.password : "";

    if (!token) {
      return NextResponse.json({ error: "Reset token is required." }, { status: 400 });
    }
    if (password.length > 128) {
      return NextResponse.json({ error: "Password cannot exceed 128 characters." }, { status: 400 });
    }

    const policy = await getSecurityPolicy();
    const validationMessage = validatePasswordWithPolicy(password, policy);
    if (validationMessage) {
      return NextResponse.json({ error: validationMessage }, { status: 400 });
    }

    const resolved = await resolvePasswordResetToken(token);
    if (!resolved) {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: resolved.userId },
      select: { id: true, login: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
      await consumePasswordResetTokenByHash(resolved.tokenHash, resolved.userId);
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: passwordHash, lastActivity: new Date() },
    });

    await consumePasswordResetTokenByHash(resolved.tokenHash, resolved.userId);

    await writeAuditLog({
      userId: user.id,
      action: "PASSWORD_RESET_COMPLETED",
      module: "administration",
      details: JSON.stringify({ login: user.login, email: user.email }),
      ipAddress,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/auth/reset-password]", error);
    await writeAuditLog({
      action: "PASSWORD_RESET_FAILED",
      module: "administration",
      details: JSON.stringify({ error: error instanceof Error ? error.message : "unknown_error" }),
      ipAddress,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
