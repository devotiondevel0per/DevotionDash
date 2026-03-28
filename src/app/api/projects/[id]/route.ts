import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectReadAccess, requireProjectWriteAccess } from "@/lib/project-access";
import { loadProjectTaskStages } from "@/lib/workflow-config";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const projectAccess = await requireProjectReadAccess(accessResult.ctx, id);
    if (!projectAccess.ok) return projectAccess.response;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        category: true,
        members: {
          include: {
            user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
          },
        },
        phases: {
          orderBy: { order: "asc" },
        },
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, fullname: true, photoUrl: true } },
            phase: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const taskStages = await loadProjectTaskStages();

    return NextResponse.json({ ...project, taskStages });
  } catch (error) {
    console.error("[GET /api/projects/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, id, {
      managerOnly: true,
    });
    if (!projectAccess.ok) return projectAccess.response;

    const body = await req.json();
    const { name, description, status, startDate, endDate } = body as {
      name?: string;
      description?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    };

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      },
      include: {
        category: true,
        members: {
          include: {
            user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
          },
        },
        tasks: {
          select: { status: true },
        },
        _count: { select: { phases: true, tasks: true } },
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error("[PUT /api/projects/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, id, {
      managerOnly: true,
    });
    if (!projectAccess.ok) return projectAccess.response;

    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/projects/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
