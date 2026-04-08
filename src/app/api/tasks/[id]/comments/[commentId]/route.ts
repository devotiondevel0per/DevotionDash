import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

type RouteContext = { params: Promise<{ id: string; commentId: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id, commentId } = await params;
    const body = await req.json();
    const { content } = body as { content?: string };

    if (!content || typeof content !== "string" || content.trim() === "") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const existing = await prisma.taskComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        taskId: true,
        userId: true,
        task: {
          select: {
            id: true,
            type: true,
            creatorId: true,
          },
        },
      },
    });

    if (!existing || existing.taskId !== id) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (existing.task.type !== "note") {
      return NextResponse.json(
        { error: "Conversation editing is only available for note tasks" },
        { status: 403 }
      );
    }

    const isAdmin = accessResult.ctx.access.isAdmin;
    const canManageTasks = accessResult.ctx.access.permissions.tasks.manage;
    if (!isAdmin && !canManageTasks) {
      const isCommentAuthor = existing.userId === accessResult.ctx.userId;
      if (!isCommentAuthor) {
        return NextResponse.json(
          { error: "You can edit only your own conversation in notes" },
          { status: 403 }
        );
      }
    }

    const updated = await prisma.taskComment.update({
      where: { id: commentId },
      data: { content: content.trim() },
      include: {
        user: { select: { id: true, name: true, fullname: true } },
        attachments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            fileSize: true,
            mimeType: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PUT /api/tasks/[id]/comments/[commentId]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return PUT(req, ctx);
}
