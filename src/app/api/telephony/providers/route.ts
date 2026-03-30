import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

export async function GET() {
  const r = await requireModuleAccess("telephony", "read");
  if (!r.ok) return r.response;
  const providers = await r.ctx.db.telephonyProvider.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(providers);
}

export async function POST(req: NextRequest) {
  const r = await requireModuleAccess("telephony", "manage");
  if (!r.ok) return r.response;
  const body = await req.json() as {
    name: string; providerType?: string; host: string; port?: number;
    username: string; password: string; transport?: string;
    fromDomain?: string; callerIdName?: string; callerIdNum?: string;
    isActive?: boolean; isDefault?: boolean; notes?: string;
  };
  if (!body.name?.trim() || !body.host?.trim() || !body.username?.trim() || !body.password?.trim()) {
    return NextResponse.json({ error: "name, host, username and password are required" }, { status: 400 });
  }
  const resolvedPort = Number.isFinite(body.port) ? Number(body.port) : 5060;
  if (!Number.isInteger(resolvedPort) || resolvedPort < 1 || resolvedPort > 65535) {
    return NextResponse.json({ error: "port must be between 1 and 65535" }, { status: 400 });
  }
  if (body.isDefault) {
    await r.ctx.db.telephonyProvider.updateMany({ data: { isDefault: false } });
  }
  const provider = await r.ctx.db.telephonyProvider.create({
    data: {
      name: body.name.trim(),
      providerType: body.providerType ?? "generic",
      host: body.host.trim(),
      port: resolvedPort,
      username: body.username.trim(),
      password: body.password.trim(),
      transport: body.transport ?? "UDP",
      fromDomain: body.fromDomain?.trim() || null,
      callerIdName: body.callerIdName?.trim() || null,
      callerIdNum: body.callerIdNum?.trim() || null,
      isActive: body.isActive ?? true,
      isDefault: body.isDefault ?? false,
      notes: body.notes?.trim() || null,
    },
  });
  await writeAuditLog({
    userId: r.ctx.userId,
    action: "TELEPHONY_PROVIDER_CREATED",
    module: "telephony",
    targetId: provider.id,
    details: JSON.stringify({ name: provider.name, host: provider.host, isDefault: provider.isDefault }),
    ipAddress: getClientIpAddress(req),
  });
  return NextResponse.json(provider, { status: 201 });
}
