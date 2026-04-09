import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

type RouteContext = { params: Promise<{ id: string; commentId: string }> };

function isMissingColumn(error: unknown, columnName: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    const meta = (error.meta ?? {}) as Record<string, unknown>;
    const column = String(meta.column ?? meta.field_name ?? "");
    if (column.toLowerCase().includes(columnName.toLowerCase())) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return new RegExp(columnName, "i").test(message) && /(unknown column|doesn't exist|p2022|not found)/i.test(message);
}

function isMissingTaskCommentAttachmentColumn(error: unknown) {
  return isMissingColumn(error, "taskcommentid");
}

function isMissingTaskCommentParentColumn(error: unknown) {
  return isMissingColumn(error, "parentcommentid");
}

function commentSelect(options: { includeParent: boolean; includeAttachments: boolean }) {
  const { includeParent, includeAttachments } = options;
  return {
    id: true,
    taskId: true,
    userId: true,
    content: true,
    createdAt: true,
    ...(includeParent ? { parentCommentId: true } : {}),
    user: { select: { id: true, name: true, fullname: true } },
    ...(includeAttachments
      ? {
          attachments: {
            orderBy: { createdAt: "asc" as const },
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              fileSize: true,
              mimeType: true,
              createdAt: true,
            },
          },
        }
      : {}),
  };
}

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

    const attempts = [
      { includeParent: true, includeAttachments: true },
      { includeParent: false, includeAttachments: true },
      { includeParent: true, includeAttachments: false },
      { includeParent: false, includeAttachments: false },
    ] as const;

    let updated: Record<string, unknown> | null = null;
    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        updated = await prisma.taskComment.update({
          where: { id: commentId },
          data: { content: content.trim() },
          select: commentSelect({
            includeParent: attempt.includeParent,
            includeAttachments: attempt.includeAttachments,
          }),
        });
        if (!attempt.includeParent) {
          updated = { ...updated, parentCommentId: null };
        }
        if (!attempt.includeAttachments) {
          updated = { ...updated, attachments: [] };
        }
        break;
      } catch (error) {
        const missingParent = attempt.includeParent && isMissingTaskCommentParentColumn(error);
        const missingAttachment = attempt.includeAttachments && isMissingTaskCommentAttachmentColumn(error);
        if (!missingParent && !missingAttachment) throw error;
        lastError = error;
      }
    }

    if (!updated) throw lastError;

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PUT /api/tasks/[id]/comments/[commentId]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return PUT(req, ctx);
}
