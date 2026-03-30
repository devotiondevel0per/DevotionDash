import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModuleAccess("servicedesk", "manage");
  if (!r.ok) return r.response;
  const { id } = await params;
  const widget = await r.ctx.db.ticketWidget.findUnique({ where: { id } });
  if (!widget) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(widget);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModuleAccess("servicedesk", "manage");
  if (!r.ok) return r.response;
  const { id } = await params;

  const body = (await req.json()) as {
    name?: string;
    enabled?: boolean;
    brandLabel?: string;
    welcomeText?: string;
    accentColor?: string;
    position?: string;
    defaultGroupId?: string | null;
    allowDomains?: string | null;
    logoUrl?: string | null;
  };

  const widget = await r.ctx.db.ticketWidget.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.brandLabel !== undefined ? { brandLabel: body.brandLabel } : {}),
      ...(body.welcomeText !== undefined ? { welcomeText: body.welcomeText } : {}),
      ...(body.accentColor !== undefined ? { accentColor: body.accentColor } : {}),
      ...(body.position !== undefined ? { position: body.position } : {}),
      ...(body.defaultGroupId !== undefined ? { defaultGroupId: body.defaultGroupId } : {}),
      ...(body.allowDomains !== undefined ? { allowDomains: body.allowDomains } : {}),
      ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl } : {}),
    },
  });

  await writeAuditLog({
    userId: r.ctx.userId,
    action: "TICKET_WIDGET_UPDATED",
    module: "servicedesk",
    targetId: id,
    details: JSON.stringify({ name: widget.name, enabled: widget.enabled }),
    ipAddress: getClientIpAddress(req),
  });

  return NextResponse.json(widget);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModuleAccess("servicedesk", "manage");
  if (!r.ok) return r.response;
  const { id } = await params;
  const existing = await r.ctx.db.ticketWidget.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await r.ctx.db.ticketWidget.delete({ where: { id } });
  await writeAuditLog({
    userId: r.ctx.userId,
    action: "TICKET_WIDGET_DELETED",
    module: "servicedesk",
    targetId: id,
    details: JSON.stringify({ name: existing.name }),
    ipAddress: getClientIpAddress(_req),
  });
  return NextResponse.json({ ok: true });
}
