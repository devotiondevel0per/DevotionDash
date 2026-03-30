import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { generateWidgetToken } from "@/lib/livechat-widget-auth";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("livechat", "manage");
  if (!accessResult.ok) return accessResult.response;
  const db = accessResult.ctx.db;

  try {
    const { id } = await params;
    const widget = await db.liveChatWidget.findUnique({ where: { id } });
    if (!widget) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(widget);
  } catch (error) {
    console.error("[GET /api/administration/livechat/widgets/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("livechat", "manage");
  if (!accessResult.ok) return accessResult.response;
  const db = accessResult.ctx.db;

  try {
    const { id } = await params;
    const body = (await req.json()) as {
      name?: string;
      domain?: string;
      enabled?: boolean;
      brandLabel?: string;
      logoUrl?: string;
      welcomeText?: string;
      accentColor?: string;
      position?: string;
      allowDomains?: string;
      rotateToken?: boolean;
    };

    const existing = await db.liveChatWidget.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const newToken = body.rotateToken ? generateWidgetToken() : undefined;

    const widget = await db.liveChatWidget.update({
      where: { id },
      data: {
        ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim() } : {}),
        ...(body.domain !== undefined ? { domain: typeof body.domain === "string" ? body.domain.trim() || null : null } : {}),
        ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
        ...(typeof body.brandLabel === "string" ? { brandLabel: body.brandLabel.trim() || "Chat with us" } : {}),
        ...(body.logoUrl !== undefined ? { logoUrl: typeof body.logoUrl === "string" ? body.logoUrl.trim() || null : null } : {}),
        ...(typeof body.welcomeText === "string" ? { welcomeText: body.welcomeText.trim() || "Hi! How can we help you today?" } : {}),
        ...(typeof body.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.accentColor) ? { accentColor: body.accentColor } : {}),
        ...(body.position === "left" || body.position === "right" ? { position: body.position } : {}),
        ...(body.allowDomains !== undefined ? { allowDomains: typeof body.allowDomains === "string" ? body.allowDomains.trim() || null : null } : {}),
        ...(newToken ? { token: newToken } : {}),
      },
    });

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: body.rotateToken ? "LIVECHAT_WIDGET_TOKEN_ROTATED" : "LIVECHAT_WIDGET_UPDATED",
      module: "livechat",
      targetId: id,
      details: JSON.stringify({ name: widget.name, enabled: widget.enabled, rotateToken: Boolean(body.rotateToken) }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json(widget);
  } catch (error) {
    console.error("[PUT /api/administration/livechat/widgets/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("livechat", "manage");
  if (!accessResult.ok) return accessResult.response;
  const db = accessResult.ctx.db;

  try {
    const { id } = await params;
    const existing = await db.liveChatWidget.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await db.liveChatWidget.delete({ where: { id } });
    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "LIVECHAT_WIDGET_DELETED",
      module: "livechat",
      targetId: id,
      details: JSON.stringify({ name: existing.name }),
      ipAddress: getClientIpAddress(_req),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/administration/livechat/widgets/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
