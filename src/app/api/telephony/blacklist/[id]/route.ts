import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const r = await requireModuleAccess("telephony", "manage");
  if (!r.ok) return r.response;
  const { id } = await params;
  await prisma.telephonyBlacklist.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
