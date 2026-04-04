import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectReadAccess, requireProjectWriteAccess } from "@/lib/project-access";

type RouteContext = { params: Promise<{ id: string; taskId: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("projects", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId, taskId } = await params;
    const projectAccess = await requireProjectReadAccess(accessResult.ctx, projectId);
    if (!projectAccess.ok) return projectAccess.response;

    const task = await prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const comments = await prisma.projectTaskComment.findMany({
      where: { projectTaskId: taskId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, fullname: true } },
      },
    });

    return NextResponse.json(comments);
  } catch (error) {
    console.error("[GET /api/projects/[id]/tasks/[taskId]/comments]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId, taskId } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, projectId);
    if (!projectAccess.ok) return projectAccess.response;

    const task = await prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = await req.json();
    const { content } = body as { content: string };

    if (!content || typeof content !== "string" || content.trim() === "") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const comment = await prisma.projectTaskComment.create({
      data: {
        projectTaskId: taskId,
        userId: accessResult.ctx.userId,
        content: content.trim(),
      },
      include: {
        user: { select: { id: true, name: true, fullname: true } },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projects/[id]/tasks/[taskId]/comments]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
