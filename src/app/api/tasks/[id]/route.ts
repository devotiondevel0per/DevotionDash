import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { normalizeTaskAssigneePermissions } from "@/lib/task-assignees";
import { notifyTaskChange } from "@/lib/task-notifications";
import {
  canCurrentUserCommentOnTask,
  isMissingTaskAssigneeCanCommentColumn,
} from "@/lib/task-access";
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

function taskAssigneeSelect(includeCanComment: boolean) {
  return includeCanComment
    ? {
        id: true,
        userId: true,
        canComment: true,
        user: { select: { id: true, name: true, fullname: true } },
      }
    : {
        id: true,
        userId: true,
        user: { select: { id: true, name: true, fullname: true } },
      };
}

function taskInclude(options: {
  userId: string;
  includeCanComment: boolean;
  includeTaskCommentAttachments: boolean;
  includeTaskCommentParent: boolean;
}) {
  const { userId, includeCanComment, includeTaskCommentAttachments, includeTaskCommentParent } = options;
  return {
    creator: { select: { id: true, name: true, fullname: true } },
    assignees: {
      select: taskAssigneeSelect(includeCanComment),
    },
    comments: {
      orderBy: { createdAt: "asc" as const },
      select: {
        id: true,
        taskId: true,
        userId: true,
        content: true,
        createdAt: true,
        ...(includeTaskCommentParent ? { parentCommentId: true } : {}),
        user: { select: { id: true, name: true, fullname: true } },
        ...(includeTaskCommentAttachments
          ? {
            attachments: {
                orderBy: { createdAt: "asc" as const },
                select: attachmentSelect,
              },
            }
          : {}),
      },
    },
    favorites: {
      where: { userId },
      select: { id: true },
    },
    _count: { select: { comments: true, favorites: true } },
    attachments: includeTaskCommentAttachments
      ? {
          where: { taskCommentId: null },
          orderBy: { createdAt: "asc" as const },
          select: attachmentSelect,
        }
      : {
          orderBy: { createdAt: "asc" as const },
          select: attachmentSelect,
        },
  };
}

async function findTaskWithCompat(id: string, userId: string) {
  const attempts = [
    { includeCanComment: true, includeTaskCommentAttachments: true, includeTaskCommentParent: true },
    { includeCanComment: false, includeTaskCommentAttachments: true, includeTaskCommentParent: true },
    { includeCanComment: true, includeTaskCommentAttachments: false, includeTaskCommentParent: true },
    { includeCanComment: false, includeTaskCommentAttachments: false, includeTaskCommentParent: true },
    { includeCanComment: true, includeTaskCommentAttachments: true, includeTaskCommentParent: false },
    { includeCanComment: false, includeTaskCommentAttachments: true, includeTaskCommentParent: false },
    { includeCanComment: true, includeTaskCommentAttachments: false, includeTaskCommentParent: false },
    { includeCanComment: false, includeTaskCommentAttachments: false, includeTaskCommentParent: false },
  ] as const;

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      return await prisma.task.findUnique({
        where: { id },
        include: taskInclude({
          userId,
          includeCanComment: attempt.includeCanComment,
          includeTaskCommentAttachments: attempt.includeTaskCommentAttachments,
          includeTaskCommentParent: attempt.includeTaskCommentParent,
        }),
      });
    } catch (error) {
      const missingCanComment =
        attempt.includeCanComment && isMissingTaskAssigneeCanCommentColumn(error);
      const missingTaskCommentAttachment =
        attempt.includeTaskCommentAttachments && isMissingTaskCommentAttachmentColumn(error);
      const missingTaskCommentParent =
        attempt.includeTaskCommentParent && isMissingTaskCommentParentColumn(error);
      if (!missingCanComment && !missingTaskCommentAttachment && !missingTaskCommentParent) throw error;
      lastError = error;
    }
  }

  throw lastError;
}

type NormalizedTaskAssignee = {
  id: string;
  userId: string;
  canComment: boolean;
  user: { id: string; name: string; fullname: string };
};

type NormalizedTaskComment = {
  id: string;
  taskId: string;
  userId: string;
  parentCommentId: string | null;
  content: string;
  createdAt: Date;
  user: { id: string; name: string; fullname: string };
  attachments: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    createdAt: Date;
  }>;
};

function normalizeTaskAssigneesForResponse(
  assignees: Array<{
    id?: string;
    userId?: string;
    canComment?: boolean;
    user?: { id?: string; name?: string; fullname?: string };
  }>
): NormalizedTaskAssignee[] {
  return assignees.map((entry) => ({
    id: String(entry.id ?? ""),
    userId: String(entry.userId ?? ""),
    canComment: typeof entry.canComment === "boolean" ? entry.canComment : true,
    user: {
      id: String(entry.user?.id ?? ""),
      name: String(entry.user?.name ?? ""),
      fullname: String(entry.user?.fullname ?? ""),
    },
  }));
}

function normalizeTaskCommentsForResponse(
  comments: Array<{
    id?: string;
    taskId?: string;
    userId?: string;
    parentCommentId?: string | null;
    content?: string;
    createdAt?: Date;
    user?: { id?: string; name?: string; fullname?: string };
    attachments?: Array<{
      id?: string;
      fileName?: string;
      fileUrl?: string;
      fileSize?: number;
      mimeType?: string;
      createdAt?: Date;
    }>;
  }>
): NormalizedTaskComment[] {
  return comments.map((entry) => ({
    id: String(entry.id ?? ""),
    taskId: String(entry.taskId ?? ""),
    userId: String(entry.userId ?? ""),
    parentCommentId:
      typeof entry.parentCommentId === "string" && entry.parentCommentId.trim()
        ? entry.parentCommentId
        : null,
    content: String(entry.content ?? ""),
    createdAt: entry.createdAt instanceof Date ? entry.createdAt : new Date(0),
    user: {
      id: String(entry.user?.id ?? ""),
      name: String(entry.user?.name ?? ""),
      fullname: String(entry.user?.fullname ?? ""),
    },
    attachments: Array.isArray(entry.attachments)
      ? entry.attachments.map((attachment) => ({
          id: String(attachment.id ?? ""),
          fileName: String(attachment.fileName ?? ""),
          fileUrl: String(attachment.fileUrl ?? ""),
          fileSize: Number(attachment.fileSize ?? 0),
          mimeType: String(attachment.mimeType ?? ""),
          createdAt: attachment.createdAt instanceof Date ? attachment.createdAt : new Date(0),
        }))
      : [],
  }));
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
    const normalizedAssignees = normalizeTaskAssigneesForResponse(
      task.assignees as Array<{
        id?: string;
        userId?: string;
        canComment?: boolean;
        user?: { id?: string; name?: string; fullname?: string };
      }>
    );
    const normalizedComments = normalizeTaskCommentsForResponse(
      task.comments as Array<{
        id?: string;
        taskId?: string;
        userId?: string;
        parentCommentId?: string | null;
        content?: string;
        createdAt?: Date;
        user?: { id?: string; name?: string; fullname?: string };
        attachments?: Array<{
          id?: string;
          fileName?: string;
          fileUrl?: string;
          fileSize?: number;
          mimeType?: string;
          createdAt?: Date;
        }>;
      }>
    );

    const canComment = canCurrentUserCommentOnTask(
      {
        id: task.id,
        creatorId: task.creatorId,
        assignees: normalizedAssignees.map((entry) => ({
          userId: String(entry.userId ?? ""),
          canComment: Boolean(entry.canComment),
        })),
      },
      userId,
      accessResult.ctx.access
    );
    const canDelete = accessResult.ctx.access.isAdmin || accessResult.ctx.access.permissions.tasks.manage;

    return NextResponse.json({
      ...task,
      assignees: normalizedAssignees,
      comments: normalizedComments,
      canComment,
      canDelete,
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
      assignees,
      assigneeIds,
    } = body as {
      title?: string;
      description?: string;
      type?: string;
      status?: string;
      priority?: string;
      dueDate?: string | null;
      isPrivate?: boolean;
      assignees?: Array<{ userId?: string; canComment?: boolean }>;
      assigneeIds?: string[];
    };
    const hasAssigneeUpdate = assignees !== undefined || assigneeIds !== undefined;
    const normalizedAssignees = normalizeTaskAssigneePermissions({
      assignees,
      assigneeIds,
    });

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

    const runUpdate = async (includeCanComment: boolean) => {
      await prisma.$transaction(async (tx) => {
        if (hasAssigneeUpdate) {
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
            ...(hasAssigneeUpdate && normalizedAssignees.length > 0 && {
              assignees: {
                create: normalizedAssignees.map((entry) =>
                  includeCanComment
                    ? { userId: entry.userId, canComment: entry.canComment }
                    : { userId: entry.userId }
                ),
              },
            }),
          },
        });
      });
    };

    try {
      await runUpdate(true);
    } catch (error) {
      if (!(hasAssigneeUpdate && isMissingTaskAssigneeCanCommentColumn(error))) {
        throw error;
      }
      await runUpdate(false);
    }

    const task = await findTaskWithCompat(id, userId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const normalizedTaskAssignees = normalizeTaskAssigneesForResponse(
      task.assignees as Array<{
        id?: string;
        userId?: string;
        canComment?: boolean;
        user?: { id?: string; name?: string; fullname?: string };
      }>
    );
    const assigneeUserIds = normalizedTaskAssignees
      .map((entry) => entry.user.id)
      .filter((idValue) => idValue.length > 0);
    const summaryParts: string[] = [];
    if (statusToUse !== undefined && statusToUse !== existing.status) summaryParts.push(`status ${existing.status} -> ${task.status}`);
    if (priority !== undefined && priority !== existing.priority) summaryParts.push(`priority ${existing.priority} -> ${task.priority}`);
    if (dueDate !== undefined) {
      const nextDue = task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "none";
      summaryParts.push(`due ${nextDue}`);
    }
    if (hasAssigneeUpdate) {
      const commentersCount = normalizedTaskAssignees.filter((entry) => Boolean(entry.canComment)).length;
      summaryParts.push(`assignees ${normalizedTaskAssignees.length} (${commentersCount} can comment)`);
    }

    const canComment = canCurrentUserCommentOnTask(
      {
        id: task.id,
        creatorId: task.creatorId,
        assignees: normalizedTaskAssignees.map((entry) => ({
          userId: String(entry.userId ?? ""),
          canComment: Boolean(entry.canComment),
        })),
      },
      userId,
      accessResult.ctx.access
    );
    const canDelete = accessResult.ctx.access.isAdmin || accessResult.ctx.access.permissions.tasks.manage;

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
      assignees: normalizedTaskAssignees,
      canComment,
      canDelete,
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
  const accessResult = await requireModuleAccess("tasks", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await prisma.task.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/tasks/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
