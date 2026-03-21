import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const r = await requireModuleAccess("telephony", "manage");
  if (!r.ok) return r.response;
  const { id } = await params;
  const body = (await req.json()) as { number?: string; userId?: string | null; password?: string; isActive?: boolean };
  const ext = await r.ctx.db.extension.update({
    where: { id },
    data: {
      number: body.number,
      userId: body.userId ?? null,
      password: body.password,
      isActive: body.isActive,
    },
  });
  return NextResponse.json(ext);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const r = await requireModuleAccess("telephony", "manage");
  if (!r.ok) return r.response;
  const { id } = await params;
  await r.ctx.db.extension.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

