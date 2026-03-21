import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const r = await requireModuleAccess("telephony", "read");
  if (!r.ok) return r.response;
  const providers = await prisma.telephonyProvider.findMany({ orderBy: { createdAt: "asc" } });
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
  if (body.isDefault) {
    await prisma.telephonyProvider.updateMany({ data: { isDefault: false } });
  }
  const provider = await prisma.telephonyProvider.create({
    data: {
      name: body.name.trim(),
      providerType: body.providerType ?? "generic",
      host: body.host.trim(),
      port: body.port ?? 5060,
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
  return NextResponse.json(provider, { status: 201 });
}
