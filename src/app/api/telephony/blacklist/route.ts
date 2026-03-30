import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

export async function GET() {
  const r = await requireModuleAccess("telephony", "read");
  if (!r.ok) return r.response;
  const list = await r.ctx.db.telephonyBlacklist.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const r = await requireModuleAccess("telephony", "manage");
  if (!r.ok) return r.response;
  const body = await req.json() as { number: string; reason?: string };
  if (!body.number?.trim()) return NextResponse.json({ error: "number is required" }, { status: 400 });
  const entry = await r.ctx.db.telephonyBlacklist.create({
    data: { number: body.number.trim(), reason: body.reason?.trim() || null },
  });
  await writeAuditLog({
    userId: r.ctx.userId,
    action: "TELEPHONY_BLACKLIST_ADDED",
    module: "telephony",
    targetId: entry.id,
    details: JSON.stringify({ number: entry.number, reason: entry.reason }),
    ipAddress: getClientIpAddress(req),
  });
  return NextResponse.json(entry, { status: 201 });
}
