import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const r = await requireModuleAccess("telephony", "read");
  if (!r.ok) return r.response;
  const list = await prisma.telephonyBlacklist.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const r = await requireModuleAccess("telephony", "manage");
  if (!r.ok) return r.response;
  const body = await req.json() as { number: string; reason?: string };
  if (!body.number?.trim()) return NextResponse.json({ error: "number is required" }, { status: 400 });
  const entry = await prisma.telephonyBlacklist.create({
    data: { number: body.number.trim(), reason: body.reason?.trim() || null },
  });
  return NextResponse.json(entry, { status: 201 });
}
