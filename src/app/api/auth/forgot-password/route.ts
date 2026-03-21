import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";
import { cleanupExpiredPasswordResetTokens, createPasswordResetToken } from "@/lib/password-reset";
import { sendPasswordResetEmail } from "@/lib/password-reset-email";

function normalizeIdentifier(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildResetUrl(request: NextRequest, token: string) {
  const origin = process.env.NEXTAUTH_URL?.trim() || request.nextUrl.origin;
  return `${origin}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function POST(req: NextRequest) {
  const ipAddress = getClientIpAddress(req);
  try {
    const body = (await req.json()) as { identifier?: string; email?: string; login?: string };
    const identifier = normalizeIdentifier(body.identifier || body.email || body.login);

    if (!identifier) {
      return NextResponse.json({ error: "Email or login is required." }, { status: 400 });
    }

    await cleanupExpiredPasswordResetTokens();

    const identifierLower = identifier.toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [{ email: identifierLower }, { login: identifier }],
      },
      select: {
        id: true,
        email: true,
        fullname: true,
        name: true,
      },
    });

    let emailSent = false;
    let sendReason = "not_requested";

    if (user) {
      const { token, expiresAt } = await createPasswordResetToken(user.id);
      const result = await sendPasswordResetEmail({
        toEmail: user.email,
        toName: user.fullname || user.name || "User",
        resetUrl: buildResetUrl(req, token),
        expiresAtIso: expiresAt,
      });
      emailSent = result.sent;
      sendReason = result.sent ? "sent" : result.reason;
    }

    await writeAuditLog({
      userId: user?.id ?? null,
      action: "PASSWORD_RESET_REQUESTED",
      module: "administration",
      details: JSON.stringify({
        identifier,
        userFound: Boolean(user),
        emailSent,
        sendReason,
      }),
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: "If an account exists, a reset link has been sent to the registered email.",
    });
  } catch (error) {
    console.error("[POST /api/auth/forgot-password]", error);
    await writeAuditLog({
      action: "PASSWORD_RESET_REQUEST_FAILED",
      module: "administration",
      details: JSON.stringify({ error: error instanceof Error ? error.message : "unknown_error" }),
      ipAddress,
    });
    return NextResponse.json({
      success: true,
      message: "If an account exists, a reset link has been sent to the registered email.",
    });
  }
}
