import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSecurityPolicy, validatePasswordWithPolicy } from "@/lib/security-policy";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };

    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: "Current password, new password, and confirm password are required." },
        { status: 400 }
      );
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "New password and confirm password do not match." }, { status: 400 });
    }
    if (newPassword.length > 128) {
      return NextResponse.json({ error: "Password cannot exceed 128 characters." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        login: true,
        email: true,
        password: true,
        isActive: true,
      },
    });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "User not found or inactive." }, { status: 404 });
    }

    const currentMatches = await bcrypt.compare(currentPassword, user.password);
    if (!currentMatches) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (sameAsCurrent) {
      return NextResponse.json({ error: "New password must be different from current password." }, { status: 400 });
    }

    const policy = await getSecurityPolicy();
    const policyValidation = validatePasswordWithPolicy(newPassword, policy);
    if (policyValidation) {
      return NextResponse.json({ error: policyValidation }, { status: 400 });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hash, lastActivity: new Date() },
    });

    await writeAuditLog({
      userId: user.id,
      action: "SELF_PASSWORD_CHANGED",
      module: "profile",
      details: JSON.stringify({
        login: user.login,
        email: user.email,
      }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/account/password]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
