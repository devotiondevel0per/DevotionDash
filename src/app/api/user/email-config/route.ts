import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { loadEmailConfig, saveEmailConfig, maskEmailConfig } from "@/lib/email-config";

export async function GET() {
  const accessResult = await requireModuleAccess("email", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const config = await loadEmailConfig(accessResult.ctx.userId);
    if (!config) {
      return NextResponse.json({
        imapHost: "", imapPort: 993, imapSsl: true, imapLogin: "", imapPassword: "",
        smtpHost: "", smtpPort: 587, smtpSsl: true, smtpLogin: "", smtpPassword: "",
        fromName: "", fromEmail: "", isEnabled: false, lastSyncAt: null,
      });
    }
    return NextResponse.json(maskEmailConfig(config));
  } catch (error) {
    console.error("[GET /api/user/email-config]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const accessResult = await requireModuleAccess("email", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json().catch(() => ({}));
    const config = await saveEmailConfig(accessResult.ctx.userId, body);
    return NextResponse.json(maskEmailConfig(config));
  } catch (error) {
    console.error("[PUT /api/user/email-config]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
