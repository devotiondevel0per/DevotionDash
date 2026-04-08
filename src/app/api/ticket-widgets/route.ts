import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { randomBytes } from "crypto";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

export async function GET() {
  const r = await requireModuleAccess("servicedesk", "manage");
  if (!r.ok) return r.response;
  const widgets = await r.ctx.db.ticketWidget.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(widgets);
}

export async function POST(req: NextRequest) {
  const r = await requireModuleAccess("servicedesk", "manage");
  if (!r.ok) return r.response;

  const body = (await req.json()) as {
    name?: string;
    brandLabel?: string;
    welcomeText?: string;
    accentColor?: string;
    position?: string;
    defaultGroupId?: string;
    allowDomains?: string;
    logoUrl?: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const widget = await r.ctx.db.ticketWidget.create({
    data: {
      name: body.name.trim(),
      token: randomBytes(20).toString("hex"),
      brandLabel: body.brandLabel?.trim() || "Support",
      welcomeText: body.welcomeText?.trim() || "Hi! How can we help you today?",
      accentColor: body.accentColor?.trim() || "#B0812B",
      position: body.position || "right",
      defaultGroupId: body.defaultGroupId || null,
      allowDomains: body.allowDomains || null,
      logoUrl: body.logoUrl || null,
    },
  });

  await writeAuditLog({
    userId: r.ctx.userId,
    action: "TICKET_WIDGET_CREATED",
    module: "servicedesk",
    targetId: widget.id,
    details: JSON.stringify({ name: widget.name, enabled: widget.enabled }),
    ipAddress: getClientIpAddress(req),
  });

  return NextResponse.json(widget, { status: 201 });
}
