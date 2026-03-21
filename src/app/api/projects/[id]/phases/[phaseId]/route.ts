import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectWriteAccess } from "@/lib/project-access";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; phaseId: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId, phaseId } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, projectId, {
      managerOnly: true,
    });
    if (!projectAccess.ok) return projectAccess.response;

    const phaseRecord = await prisma.projectPhase.findFirst({
      where: { id: phaseId, projectId },
      select: { id: true },
    });
    if (!phaseRecord) {
      return NextResponse.json({ error: "Phase not found" }, { status: 404 });
    }

    const body = await req.json() as { name?: string; startDate?: string | null; endDate?: string | null };
    const { name, startDate, endDate } = body;

    const phase = await prisma.projectPhase.update({
      where: { id: phaseId },
      data: {
        ...(name !== undefined && { name }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      },
    });

    return NextResponse.json(phase);
  } catch (error) {
    console.error("[PUT /api/projects/[id]/phases/[phaseId]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; phaseId: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId, phaseId } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, projectId, {
      managerOnly: true,
    });
    if (!projectAccess.ok) return projectAccess.response;

    const phaseRecord = await prisma.projectPhase.findFirst({
      where: { id: phaseId, projectId },
      select: { id: true },
    });
    if (!phaseRecord) {
      return NextResponse.json({ error: "Phase not found" }, { status: 404 });
    }

    // Unassign tasks from this phase before deleting
    await prisma.projectTask.updateMany({
      where: { phaseId },
      data: { phaseId: null },
    });

    await prisma.projectPhase.delete({ where: { id: phaseId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/projects/[id]/phases/[phaseId]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
