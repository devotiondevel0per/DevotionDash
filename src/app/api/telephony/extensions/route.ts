import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const accessResult = await requireModuleAccess("telephony", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const extensions = await prisma.extension.findMany({
      orderBy: { number: "asc" },
      select: {
        id: true,
        userId: true,
        number: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json(extensions);
  } catch (error) {
    console.error("[GET /api/telephony/extensions]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const r = await requireModuleAccess("telephony", "manage");
  if (!r.ok) return r.response;
  const body = await req.json() as { number: string; userId?: string; password: string; isActive?: boolean };
  if (!body.number?.trim() || !body.password?.trim()) {
    return NextResponse.json({ error: "number and password are required" }, { status: 400 });
  }
  const ext = await prisma.extension.create({
    data: {
      number: body.number.trim(),
      userId: body.userId ?? null,
      password: body.password.trim(),
      isActive: body.isActive ?? true,
    },
  });
  return NextResponse.json(ext, { status: 201 });
}

