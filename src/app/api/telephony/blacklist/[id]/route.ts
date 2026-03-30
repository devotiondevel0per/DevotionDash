import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const r = await requireModuleAccess("telephony", "manage");
  if (!r.ok) return r.response;
  const { id } = await params;
  const existing = await r.ctx.db.telephonyBlacklist.findUnique({ where: { id }, select: { id: true, number: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await r.ctx.db.telephonyBlacklist.delete({ where: { id } });
  await writeAuditLog({
    userId: r.ctx.userId,
    action: "TELEPHONY_BLACKLIST_REMOVED",
    module: "telephony",
    targetId: id,
    details: JSON.stringify({ number: existing.number }),
    ipAddress: getClientIpAddress(_req),
  });
  return NextResponse.json({ ok: true });
}
