import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("telephony", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const direction = searchParams.get("direction");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "300", 10), 600);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (direction) where.direction = direction;

    const calls = await prisma.callLog.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    return NextResponse.json(calls);
  } catch (error) {
    console.error("[GET /api/telephony/calls]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

