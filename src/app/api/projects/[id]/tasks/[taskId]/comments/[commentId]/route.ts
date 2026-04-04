import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectWriteAccess } from "@/lib/project-access";

type RouteContext = { params: Promise<{ id: string; taskId: string; commentId: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId, taskId, commentId } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, projectId);
    if (!projectAccess.ok) return projectAccess.response;

    const body = await req.json();
    const { content } = body as { content?: string };

    if (!content || typeof content !== "string" || content.trim() === "") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const existing = await prisma.projectTaskComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        projectTaskId: true,
        userId: true,
        projectTask: {
          select: {
            projectId: true,
          },
        },
      },
    });

    if (!existing || existing.projectTaskId !== taskId || existing.projectTask.projectId !== projectId) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (!projectAccess.scope.isManager && existing.userId !== accessResult.ctx.userId) {
      return NextResponse.json(
        { error: "You can edit only your own conversation" },
        { status: 403 }
      );
    }

    const updated = await prisma.projectTaskComment.update({
      where: { id: commentId },
      data: { content: content.trim() },
      include: {
        user: { select: { id: true, name: true, fullname: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PUT /api/projects/[id]/tasks/[taskId]/comments/[commentId]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return PUT(req, ctx);
}
