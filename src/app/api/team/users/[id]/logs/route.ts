import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("team", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const logs = await prisma.auditLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        module: true,
        details: true,
        ipAddress: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      logs.map((log) => ({
        id: log.id,
        action: log.action,
        module: log.module,
        detail: log.details,
        ip: log.ipAddress,
        createdAt: log.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error("[GET /api/team/users/[id]/logs]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
