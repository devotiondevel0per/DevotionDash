import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { loadEmailConfig, saveEmailConfig, maskEmailConfig } from "@/lib/email-config";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  const { id: userId } = await params;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  try {
    const config = await loadEmailConfig(userId);
    if (!config) {
      return NextResponse.json({
        imapHost: "", imapPort: 993, imapSsl: true, imapLogin: "", imapPassword: "",
        smtpHost: "", smtpPort: 587, smtpSsl: true, smtpLogin: "", smtpPassword: "",
        fromName: "", fromEmail: "", isEnabled: false, lastSyncAt: null,
      });
    }
    return NextResponse.json(maskEmailConfig(config));
  } catch (error) {
    console.error("[GET /api/administration/users/[id]/email-config]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  const { id: userId } = await params;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));
    const config = await saveEmailConfig(userId, body);
    return NextResponse.json(maskEmailConfig(config));
  } catch (error) {
    console.error("[PUT /api/administration/users/[id]/email-config]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
