import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { canCurrentUserCommentOnTask, loadTaskCommentAccessInfo } from "@/lib/task-access";
import { notifyTaskConversation } from "@/lib/task-notifications";

type RouteContext = { params: Promise<{ id: string }> };

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

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const task = await prisma.task.findUnique({ where: { id }, select: { id: true } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const attempts = [
      { includeParent: true, includeAttachments: true },
      { includeParent: false, includeAttachments: true },
      { includeParent: true, includeAttachments: false },
      { includeParent: false, includeAttachments: false },
    ] as const;

    let comments: Array<Record<string, unknown>> = [];
    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        comments = await prisma.taskComment.findMany({
          where: { taskId: id },
          orderBy: { createdAt: "asc" },
          select: commentSelect({
            includeParent: attempt.includeParent,
            includeAttachments: attempt.includeAttachments,
          }),
        });

        if (!attempt.includeParent) {
          comments = comments.map((comment) => ({ ...comment, parentCommentId: null }));
        }
        if (!attempt.includeAttachments) {
          comments = comments.map((comment) => ({ ...comment, attachments: [] }));
        }
        return NextResponse.json(comments);
      } catch (error) {
        const missingParent = attempt.includeParent && isMissingTaskCommentParentColumn(error);
        const missingAttachment = attempt.includeAttachments && isMissingTaskCommentAttachmentColumn(error);
        if (!missingParent && !missingAttachment) throw error;
        lastError = error;
      }
    }

    throw lastError;
  } catch (error) {
    console.error("[GET /api/tasks/[id]/comments]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const taskAccess = await loadTaskCommentAccessInfo(
      prisma,
      id,
      accessResult.ctx.userId
    );
    if (!taskAccess) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const canComment = canCurrentUserCommentOnTask(
      taskAccess,
      accessResult.ctx.userId,
      accessResult.ctx.access
    );
    if (!canComment) {
      return NextResponse.json(
        { error: "You can view this task, but commenting is disabled for your assignment" },
        { status: 403 }
      );
    }
    const taskForNotification = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        creatorId: true,
        isPrivate: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!taskForNotification) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = await req.json();
    const { content, allowEmpty, parentCommentId } = body as {
      content?: string;
      allowEmpty?: boolean;
      parentCommentId?: string | null;
    };
    const normalizedContent = typeof content === "string" ? content.trim() : "";
    if (!normalizedContent && !allowEmpty) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }
    const normalizedParentCommentId = typeof parentCommentId === "string" && parentCommentId.trim()
      ? parentCommentId.trim()
      : null;
    let repliedToUserId: string | null = null;
    if (normalizedParentCommentId) {
      const parent = await prisma.taskComment.findUnique({
        where: { id: normalizedParentCommentId },
        select: { id: true, taskId: true, userId: true },
      });
      if (!parent || parent.taskId !== id) {
        return NextResponse.json({ error: "Reply target comment not found" }, { status: 400 });
      }
      repliedToUserId = parent.userId;
    }

    const attempts = [
      { includeParent: true, includeAttachments: true },
      { includeParent: false, includeAttachments: true },
      { includeParent: true, includeAttachments: false },
      { includeParent: false, includeAttachments: false },
    ] as const;

    let comment: Record<string, unknown> | null = null;
    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        comment = await prisma.taskComment.create({
          data: {
            taskId: id,
            userId: accessResult.ctx.userId,
            content: normalizedContent,
            ...(attempt.includeParent && normalizedParentCommentId
              ? { parentCommentId: normalizedParentCommentId }
              : {}),
          },
          select: commentSelect({
            includeParent: attempt.includeParent,
            includeAttachments: attempt.includeAttachments,
          }),
        });
        if (!attempt.includeParent) {
          comment = { ...comment, parentCommentId: null };
        }
        if (!attempt.includeAttachments) {
          comment = { ...comment, attachments: [] };
        }
        break;
      } catch (error) {
        const missingParent = attempt.includeParent && isMissingTaskCommentParentColumn(error);
        const missingAttachment = attempt.includeAttachments && isMissingTaskCommentAttachmentColumn(error);
        if (!missingParent && !missingAttachment) throw error;
        lastError = error;
      }
    }

    if (!comment) throw lastError;

    await notifyTaskConversation({
      taskId: taskForNotification.id,
      taskTitle: taskForNotification.title,
      creatorId: taskForNotification.creatorId,
      assigneeIds: taskForNotification.assignees.map((entry) => entry.userId),
      actorUserId: accessResult.ctx.userId,
      isPrivate: taskForNotification.isPrivate,
      commentPreview: normalizedContent,
      repliedToUserId,
    }).catch((notifyError) => {
      console.error("[tasks notify comment]", notifyError);
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("[POST /api/tasks/[id]/comments]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
