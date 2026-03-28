import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { notifyTaskChange } from "@/lib/task-notifications";
import { isClosedStage, loadTaskStages } from "@/lib/workflow-config";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;
    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, fullname: true } },
        assignees: {
          include: { user: { select: { id: true, name: true, fullname: true } } },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, name: true, fullname: true } } },
        },
        favorites: {
          where: { userId },
          select: { id: true },
        },
        _count: { select: { comments: true, favorites: true } },
        attachments: true,
      },
    });

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

    const task = await prisma.$transaction(async (tx) => {
      if (assigneeIds !== undefined) {
        await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      }

      return tx.task.update({
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
        include: {
          creator: { select: { id: true, name: true, fullname: true } },
          assignees: {
            include: { user: { select: { id: true, name: true, fullname: true } } },
          },
          comments: {
            orderBy: { createdAt: "asc" },
            include: { user: { select: { id: true, name: true, fullname: true } } },
          },
          favorites: {
            where: { userId },
            select: { id: true },
          },
          _count: { select: { comments: true, favorites: true } },
          attachments: true,
        },
      });
    });
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
