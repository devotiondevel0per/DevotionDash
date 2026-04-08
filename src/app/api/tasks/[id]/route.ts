import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { notifyTaskChange } from "@/lib/task-notifications";
import { isClosedStage, loadTaskStages } from "@/lib/workflow-config";

type RouteContext = { params: Promise<{ id: string }> };

const attachmentSelect = {
  id: true,
  fileName: true,
  fileUrl: true,
  fileSize: true,
  mimeType: true,
  createdAt: true,
} as const;

function isMissingTaskCommentColumn(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    const meta = (error.meta ?? {}) as Record<string, unknown>;
    const column = String(meta.column ?? meta.field_name ?? "");
    if (column.toLowerCase().includes("taskcommentid")) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /taskcommentid/i.test(message) && /(unknown column|doesn't exist|p2022|not found)/i.test(message);
}

function modernTaskInclude(userId: string) {
  return {
    creator: { select: { id: true, name: true, fullname: true } },
    assignees: {
      include: { user: { select: { id: true, name: true, fullname: true } } },
    },
    comments: {
      orderBy: { createdAt: "asc" as const },
      include: {
        user: { select: { id: true, name: true, fullname: true } },
        attachments: {
          orderBy: { createdAt: "asc" as const },
          select: attachmentSelect,
        },
      },
    },
    favorites: {
      where: { userId },
      select: { id: true },
    },
    _count: { select: { comments: true, favorites: true } },
    attachments: {
      where: { taskCommentId: null },
      orderBy: { createdAt: "asc" as const },
      select: attachmentSelect,
    },
  };
}

function legacyTaskInclude(userId: string) {
  return {
    creator: { select: { id: true, name: true, fullname: true } },
    assignees: {
      include: { user: { select: { id: true, name: true, fullname: true } } },
    },
    comments: {
      orderBy: { createdAt: "asc" as const },
      include: {
        user: { select: { id: true, name: true, fullname: true } },
      },
    },
    favorites: {
      where: { userId },
      select: { id: true },
    },
    _count: { select: { comments: true, favorites: true } },
    attachments: {
      orderBy: { createdAt: "asc" as const },
      select: attachmentSelect,
    },
  };
}

async function findTaskWithCompat(id: string, userId: string) {
  try {
    return await prisma.task.findUnique({
      where: { id },
      include: modernTaskInclude(userId),
    });
  } catch (error) {
    if (!isMissingTaskCommentColumn(error)) throw error;
    return prisma.task.findUnique({
      where: { id },
      include: legacyTaskInclude(userId),
    });
  }
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;
    const { id } = await params;

    const task = await findTaskWithCompat(id, userId);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...task,
      isFavorite: task.favorites.length > 0,
      favoriteCount: task._count.favorites,
      favorites: undefined,
    });
  } catch (error) {
    console.error("[GET /api/tasks/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function updateTask(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;
    const { id } = await params;

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const stages = await loadTaskStages();
    const body = await req.json();
    const {
      title,
      description,
      type,
      status,
      priority,
      dueDate,
      isPrivate,
      assigneeIds,
    } = body as {
      title?: string;
      description?: string;
      type?: string;
      status?: string;
      priority?: string;
      dueDate?: string | null;
      isPrivate?: boolean;
      assigneeIds?: string[];
    };

    const statusToUse = status !== undefined
      ? (stages.some((stage) => stage.key === status) ? status : existing.status)
      : undefined;

    let completedAt: Date | null | undefined;
    if (statusToUse !== undefined) {
      const wasClosed = isClosedStage(stages, existing.status);
      const nowClosed = isClosedStage(stages, statusToUse);
      if (nowClosed) {
        completedAt = existing.completedAt ?? new Date();
      } else if (wasClosed) {
        completedAt = null;
      }
    }

    await prisma.$transaction(async (tx) => {
      if (assigneeIds !== undefined) {
        await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      }

      await tx.task.update({
        where: { id },
        data: {
          ...(title !== undefined && { title: title.trim() }),
          ...(description !== undefined && { description }),
          ...(type !== undefined && { type }),
          ...(statusToUse !== undefined && { status: statusToUse }),
          ...(completedAt !== undefined && { completedAt }),
          ...(priority !== undefined && { priority }),
          ...(isPrivate !== undefined && { isPrivate }),
          ...(dueDate !== undefined && {
            dueDate: dueDate ? new Date(dueDate) : null,
          }),
          ...(assigneeIds !== undefined && {
            assignees: {
              create: assigneeIds.map((userId: string) => ({ userId })),
            },
          }),
        },
      });
    });

    const task = await findTaskWithCompat(id, userId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const assigneeUserIds = task.assignees.map((entry) => entry.user.id);
    const summaryParts: string[] = [];
    if (statusToUse !== undefined && statusToUse !== existing.status) summaryParts.push(`status ${existing.status} -> ${task.status}`);
    if (priority !== undefined && priority !== existing.priority) summaryParts.push(`priority ${existing.priority} -> ${task.priority}`);
    if (dueDate !== undefined) {
      const nextDue = task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "none";
      summaryParts.push(`due ${nextDue}`);
    }
    if (assigneeUserIds.length > 0) {
      summaryParts.push(`assignees ${assigneeUserIds.length}`);
    }

    await notifyTaskChange({
      action: "updated",
      taskId: task.id,
      taskTitle: task.title,
      creatorId: task.creatorId,
      assigneeIds: assigneeUserIds,
      actorUserId: accessResult.ctx.userId,
      isPrivate: task.isPrivate,
      summary: summaryParts.length > 0 ? summaryParts.join(", ") : undefined,
    }).catch((error) => {
      console.error("[tasks notify update]", error);
    });

    return NextResponse.json({
      ...task,
      isFavorite: task.favorites.length > 0,
      favoriteCount: task._count.favorites,
      favorites: undefined,
    });
  } catch (error) {
    console.error("[PUT /api/tasks/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return updateTask(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return updateTask(req, ctx);
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const isAdmin = accessResult.ctx.access.isAdmin;
    if (task.creatorId !== accessResult.ctx.userId && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.task.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/tasks/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
