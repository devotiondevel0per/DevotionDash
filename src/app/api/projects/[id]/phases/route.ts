import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectWriteAccess } from "@/lib/project-access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, projectId, {
      managerOnly: true,
    });
    if (!projectAccess.ok) return projectAccess.response;

    const body = await req.json() as { name?: string; startDate?: string; endDate?: string };
    const { name, startDate, endDate } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const lastPhase = await prisma.projectPhase.findFirst({
      where: { projectId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const phase = await prisma.projectPhase.create({
      data: {
        projectId,
        name: name.trim(),
        order: (lastPhase?.order ?? -1) + 1,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
      },
    });

    return NextResponse.json(phase, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projects/[id]/phases]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
