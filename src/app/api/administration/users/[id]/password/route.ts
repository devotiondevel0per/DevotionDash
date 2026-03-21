import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";
import { getSecurityPolicy, validatePasswordWithPolicy } from "@/lib/security-policy";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const body = (await req.json()) as { password?: string };
    const password = typeof body.password === "string" ? body.password : "";

    if (password.length > 128) {
      return NextResponse.json(
        { error: "Password cannot exceed 128 characters." },
        { status: 400 }
      );
    }

    const policy = await getSecurityPolicy();
    const validationMessage = validatePasswordWithPolicy(password, policy);
    if (validationMessage) {
      return NextResponse.json({ error: validationMessage }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, login: true, email: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id },
      data: { password: passwordHash },
    });

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "USER_PASSWORD_CHANGED",
      module: "administration",
      targetId: id,
      details: JSON.stringify({ login: user.login, email: user.email }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PUT /api/administration/users/[id]/password]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
