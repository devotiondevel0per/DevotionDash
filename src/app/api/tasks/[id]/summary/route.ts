import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { generateTaskConversationSummary } from "@/lib/ai/task-conversation-summary";

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
  return (
    new RegExp(columnName, "i").test(message) &&
    /(unknown column|doesn't exist|p2022|not found)/i.test(message)
  );
}

function isMissingTaskCommentParentColumn(error: unknown) {
  return isMissingColumn(error, "parentcommentid");
}

function isMissingTaskCommentAttachmentColumn(error: unknown) {
  return isMissingColumn(error, "taskcommentid");
}

function taskSummarySelect(options: { includeParent: boolean; includeAttachments: boolean }) {
  const { includeParent, includeAttachments } = options;
  return {
    id: true,
    title: true,
    type: true,
    status: true,
    priority: true,
    description: true,
    createdAt: true,
    dueDate: true,
    creatorId: true,
    assignees: {
      select: {
        userId: true,
      },
    },
    comments: {
      orderBy: { createdAt: "asc" as const },
      select: {
        id: true,
        content: true,
        createdAt: true,
        ...(includeParent ? { parentCommentId: true } : {}),
        user: {
          select: {
            name: true,
            fullname: true,
          },
        },
        ...(includeAttachments
          ? {
              attachments: {
                select: {
                  id: true,
                },
              },
            }
          : {}),
      },
    },
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const attempts = [
      { includeParent: true, includeAttachments: true },
      { includeParent: false, includeAttachments: true },
      { includeParent: true, includeAttachments: false },
      { includeParent: false, includeAttachments: false },
    ] as const;

    let task: Record<string, unknown> | null = null;
    let usedAttempt = attempts[attempts.length - 1];
    let lastError: unknown = null;

    for (const attempt of attempts) {
      try {
        task = await prisma.task.findUnique({
          where: { id },
          select: taskSummarySelect(attempt),
        }) as Record<string, unknown> | null;
        usedAttempt = attempt;
        break;
      } catch (error) {
        const missingParent = attempt.includeParent && isMissingTaskCommentParentColumn(error);
        const missingAttachment = attempt.includeAttachments && isMissingTaskCommentAttachmentColumn(error);
        if (!missingParent && !missingAttachment) throw error;
        lastError = error;
      }
    }

    if (!task && lastError) throw lastError;
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const typedTask = task as {
      id: string;
      title: string;
      type: string;
      status: string;
      priority: string;
      description: string | null;
      createdAt: Date;
      dueDate: Date | null;
      creatorId: string;
      assignees: Array<{ userId: string }>;
      comments: Array<{
        id: string;
        content: string;
        createdAt: Date;
        parentCommentId?: string | null;
        user: { name: string; fullname: string };
        attachments?: Array<{ id: string }>;
      }>;
    };

    const canManageTasks =
      accessResult.ctx.access.isAdmin || accessResult.ctx.access.permissions.tasks.manage;
    const canReadThisTask =
      canManageTasks ||
      typedTask.creatorId === accessResult.ctx.userId ||
      typedTask.assignees.some((entry) => entry.userId === accessResult.ctx.userId);
    if (!canReadThisTask) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const summary = await generateTaskConversationSummary({
      task: {
        id: typedTask.id,
        title: typedTask.title,
        type: typedTask.type,
        status: typedTask.status,
        priority: typedTask.priority,
        description: typedTask.description,
        createdAt: typedTask.createdAt.toISOString(),
        dueDate: typedTask.dueDate ? typedTask.dueDate.toISOString() : null,
      },
      comments: typedTask.comments.map((comment) => ({
        id: comment.id,
        authorName: (comment.user.fullname || comment.user.name || "").trim() || "Unknown",
        parentCommentId: usedAttempt.includeParent
          ? typeof comment.parentCommentId === "string"
            ? comment.parentCommentId
            : null
          : null,
        content: comment.content ?? "",
        createdAt: comment.createdAt.toISOString(),
        attachmentCount: usedAttempt.includeAttachments ? (comment.attachments?.length ?? 0) : 0,
      })),
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[POST /api/tasks/[id]/summary]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
