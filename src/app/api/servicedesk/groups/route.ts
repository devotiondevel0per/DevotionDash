import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const accessResult = await requireModuleAccess("servicedesk", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const groups = await prisma.serviceDeskGroup.findMany({
      where: { isActive: true },
      include: {
        categories: {
          select: { id: true, name: true, groupId: true },
          orderBy: { name: "asc" },
        },
        _count: { select: { requests: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(groups);
  } catch (error) {
    console.error("[GET /api/servicedesk/groups]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("servicedesk", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as { name?: string; description?: string };
    const name = body.name?.trim() ?? "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const group = await prisma.serviceDeskGroup.create({
      data: {
        name,
        description: body.description?.trim() || null,
      },
    });

    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error("[POST /api/servicedesk/groups]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
