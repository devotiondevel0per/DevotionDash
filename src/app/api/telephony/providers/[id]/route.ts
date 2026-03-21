import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const r = await requireModuleAccess("telephony", "manage");
  if (!r.ok) return r.response;
  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;
  if (body.isDefault) {
    await prisma.telephonyProvider.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
  }
  const provider = await prisma.telephonyProvider.update({
    where: { id },
    data: {
      name: body.name as string,
      providerType: (body.providerType as string) ?? "generic",
      host: body.host as string,
      port: (body.port as number) ?? 5060,
      username: body.username as string,
      password: body.password as string,
      transport: (body.transport as string) ?? "UDP",
      fromDomain: (body.fromDomain as string) || null,
      callerIdName: (body.callerIdName as string) || null,
      callerIdNum: (body.callerIdNum as string) || null,
      isActive: body.isActive as boolean,
      isDefault: body.isDefault as boolean,
      notes: (body.notes as string) || null,
    },
  });
  return NextResponse.json(provider);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const r = await requireModuleAccess("telephony", "manage");
  if (!r.ok) return r.response;
  const { id } = await params;
  await prisma.telephonyProvider.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
