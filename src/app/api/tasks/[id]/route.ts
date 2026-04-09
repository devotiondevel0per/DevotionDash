import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  normalizeTaskAssigneePermissions,
  normalizeTaskGroupIds,
  type TaskAssigneePermission,
} from "@/lib/task-assignees";
import { notifyTaskChange } from "@/lib/task-notifications";
import {
  canCurrentUserCommentOnTask,
  isMissingTaskAssigneeCanCommentColumn,
} from "@/lib/task-access";
import { isClosedStage, loadTaskStages } from "@/lib/workflow-config";
import { getTaskConversationAuthorEditWindowMinutes } from "@/lib/task-conversation-policy";

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
  return (
    new RegExp(columnName, "i").test(message) &&
    /(unknown column|doesn't exist|p2022|not found)/i.test(message)
  );
}

function isMissingTaskCommentAttachmentColumn(error: unknown) {
  return isMissingColumn(error, "taskcommentid");
}

function isMissingTaskCommentParentColumn(error: unknown) {
  return isMissingColumn(error, "parentcommentid");
}

function isMissingTaskGroupAssignmentsTable(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = (error.meta ?? {}) as Record<string, unknown>;
    const target = String(meta.table ?? meta.modelName ?? meta.cause ?? "");
    if (/task_group_assignments/i.test(target)) return true;
    if (error.code === "P2021" && /task_group_assignments/i.test(String(meta.table ?? ""))) {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /task_group_assignments/i.test(message) && /(doesn't exist|unknown table|p2021)/i.test(message);
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
  includeTaskGroups: boolean;
}) {
  const {
    userId,
    includeCanComment,
    includeTaskCommentAttachments,
    includeTaskCommentParent,
    includeTaskGroups,
  } = options;
  return {
    creator: { select: { id: true, name: true, fullname: true } },
    assignees: {
      select: taskAssigneeSelect(includeCanComment),
    },
    ...(includeTaskGroups
      ? {
          assignedGroups: {
            select: {
              groupId: true,
              group: { select: { id: true, name: true, color: true } },
            },
          },
        }
      : {}),
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
  const bools = [true, false] as const;
  const attempts: Array<{
    includeCanComment: boolean;
    includeTaskCommentAttachments: boolean;
    includeTaskCommentParent: boolean;
    includeTaskGroups: boolean;
  }> = [];
  for (const includeCanComment of bools) {
    for (const includeTaskCommentAttachments of bools) {
      for (const includeTaskCommentParent of bools) {
        for (const includeTaskGroups of bools) {
          attempts.push({
            includeCanComment,
            includeTaskCommentAttachments,
            includeTaskCommentParent,
            includeTaskGroups,
          });
        }
      }
    }
  }

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const task = await prisma.task.findUnique({
        where: { id },
        include: taskInclude({
          userId,
          includeCanComment: attempt.includeCanComment,
          includeTaskCommentAttachments: attempt.includeTaskCommentAttachments,
          includeTaskCommentParent: attempt.includeTaskCommentParent,
          includeTaskGroups: attempt.includeTaskGroups,
        }),
      });
      return { task, usedAttempt: attempt };
    } catch (error) {
      const missingCanComment =
        attempt.includeCanComment && isMissingTaskAssigneeCanCommentColumn(error);
      const missingTaskCommentAttachment =
        attempt.includeTaskCommentAttachments && isMissingTaskCommentAttachmentColumn(error);
      const missingTaskCommentParent =
        attempt.includeTaskCommentParent && isMissingTaskCommentParentColumn(error);
      const missingTaskGroups =
        attempt.includeTaskGroups && isMissingTaskGroupAssignmentsTable(error);
      if (
        !missingCanComment &&
        !missingTaskCommentAttachment &&
        !missingTaskCommentParent &&
        !missingTaskGroups
      ) {
        throw error;
      }
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

type NormalizedTaskGroup = {
  id: string;
  name: string;
  color: string;
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

function normalizeTaskGroupsForResponse(
  groups: Array<{
    groupId?: string;
    group?: { id?: string; name?: string; color?: string };
  }>
): NormalizedTaskGroup[] {
  return groups
    .map((entry) => ({
      id: String(entry.group?.id ?? entry.groupId ?? ""),
      name: String(entry.group?.name ?? ""),
      color: String(entry.group?.color ?? "#94a3b8"),
    }))
    .filter((entry) => entry.id.length > 0);
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

async function resolveTaskGroupAssignments(
  requestedGroupIds: string[],
  access: {
    isAdmin: boolean;
    permissions: { tasks: { manage: boolean } };
    roles: Array<{ groupId: string }>;
  }
) {
  const normalized = normalizeTaskGroupIds(requestedGroupIds);
  if (normalized.length === 0) {
    return {
      groupIds: [] as string[],
      members: [] as string[],
    };
  }

  const existingGroups = await prisma.group.findMany({
    where: { id: { in: normalized } },
    select: { id: true },
  });
  const existingGroupIds = Array.from(new Set(existingGroups.map((group) => group.id)));
  const missing = normalized.filter((groupId) => !existingGroupIds.includes(groupId));
  if (missing.length > 0) {
    throw new Error(`Invalid groupIds: ${missing.join(", ")}`);
  }

  if (!access.isAdmin && !access.permissions.tasks.manage) {
    const ownRoleGroupIds = new Set(access.roles.map((role) => role.groupId));
    const forbidden = existingGroupIds.filter((groupId) => !ownRoleGroupIds.has(groupId));
    if (forbidden.length > 0) {
      throw new Error("You can assign only groups that are in your role scope");
    }
  }

  const groupMembers = await prisma.groupMember.findMany({
    where: { groupId: { in: existingGroupIds } },
    select: { userId: true },
  });
  const members = Array.from(new Set(groupMembers.map((entry) => entry.userId)));

  return {
    groupIds: existingGroupIds,
    members,
  };
}

function mergeAssigneesWithGroupMembers(
  assignees: TaskAssigneePermission[],
  groupMembers: string[]
) {
  const map = new Map<string, boolean>();
  for (const entry of assignees) {
    map.set(entry.userId, entry.canComment);
  }
  for (const userId of groupMembers) {
    if (!map.has(userId)) {
      map.set(userId, true);
    }
  }
  return Array.from(map.entries()).map(([userId, canComment]) => ({ userId, canComment }));
}

async function loadExistingAssigneesForUpdate(taskId: string): Promise<TaskAssigneePermission[]> {
  try {
    const result = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        assignees: {
          select: {
            userId: true,
            canComment: true,
          },
        },
      },
    });
    if (!result) return [];
    return result.assignees.map((entry) => ({
      userId: entry.userId,
      canComment: entry.canComment,
    }));
  } catch (error) {
    if (!isMissingTaskAssigneeCanCommentColumn(error)) throw error;
    const legacy = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        assignees: {
          select: {
            userId: true,
          },
        },
      },
    });
    if (!legacy) return [];
    return legacy.assignees.map((entry) => ({
      userId: entry.userId,
      canComment: true,
    }));
  }
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;
    const canManageTasks =
      accessResult.ctx.access.isAdmin || accessResult.ctx.access.permissions.tasks.manage;
    const canWriteTasks = canManageTasks || accessResult.ctx.access.permissions.tasks.write;
    const { id } = await params;

    const { task, usedAttempt } = await findTaskWithCompat(id, userId);
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
    const canReadTask =
      canManageTasks ||
      normalizedAssignees.some((entry) => entry.userId === userId);
    if (!canReadTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const normalizedAssignedGroups = usedAttempt.includeTaskGroups
      ? normalizeTaskGroupsForResponse(
          (task as { assignedGroups?: Array<{ groupId?: string; group?: { id?: string; name?: string; color?: string } }> })
            .assignedGroups ?? []
        )
      : [];
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
    const canDelete = canManageTasks;
    const conversationAuthorEditDeleteWindowMinutes =
      await getTaskConversationAuthorEditWindowMinutes();

    return NextResponse.json({
      ...task,
      assignees: normalizedAssignees,
      assignedGroups: normalizedAssignedGroups,
      comments: normalizedComments,
      canComment,
      canEditTask: canWriteTasks,
      canChangeStatus: canWriteTasks,
      canDelete,
      conversationAuthorEditDeleteWindowMinutes,
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
    const canManageTasks =
      accessResult.ctx.access.isAdmin || accessResult.ctx.access.permissions.tasks.manage;
    const { id } = await params;

    const existing = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        priority: true,
        completedAt: true,
      },
    });
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
      groupIds: rawGroupIds,
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
      groupIds?: string[];
    };

    const hasAssigneePayload = assignees !== undefined || assigneeIds !== undefined;
    const hasGroupUpdate = rawGroupIds !== undefined;
    const hasAssigneeUpdate = hasAssigneePayload || hasGroupUpdate;

    const directAssignees = hasAssigneePayload
      ? normalizeTaskAssigneePermissions({
          assignees,
          assigneeIds,
        })
      : hasGroupUpdate
        ? await loadExistingAssigneesForUpdate(id)
        : [];

    const requestedGroupIds = normalizeTaskGroupIds(rawGroupIds);
    let resolvedGroupIds: string[] = [];
    let groupMembers: string[] = [];
    if (hasGroupUpdate && requestedGroupIds.length > 0) {
      try {
        const resolved = await resolveTaskGroupAssignments(
          requestedGroupIds,
          accessResult.ctx.access
        );
        resolvedGroupIds = resolved.groupIds;
        groupMembers = resolved.members;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid group assignment";
        if (/Invalid groupIds/i.test(message)) {
          return NextResponse.json({ error: message }, { status: 400 });
        }
        return NextResponse.json({ error: message }, { status: 403 });
      }
    }
    const normalizedAssignees = hasAssigneeUpdate
      ? mergeAssigneesWithGroupMembers(directAssignees, groupMembers)
      : [];

    const statusToUse =
      status !== undefined
        ? stages.some((stage) => stage.key === status)
          ? status
          : existing.status
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

    const runUpdate = async (options: { includeCanComment: boolean; includeTaskGroups: boolean }) => {
      const { includeCanComment, includeTaskGroups } = options;
      await prisma.$transaction(async (tx) => {
        if (hasAssigneeUpdate) {
          await tx.taskAssignee.deleteMany({ where: { taskId: id } });
        }
        if (hasGroupUpdate && includeTaskGroups) {
          await tx.taskGroupAssignment.deleteMany({ where: { taskId: id } });
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
            ...(hasAssigneeUpdate && normalizedAssignees.length > 0
              ? {
                  assignees: {
                    create: normalizedAssignees.map((entry) =>
                      includeCanComment
                        ? { userId: entry.userId, canComment: entry.canComment }
                        : { userId: entry.userId }
                    ),
                  },
                }
              : {}),
            ...(hasGroupUpdate && includeTaskGroups && resolvedGroupIds.length > 0
              ? {
                  assignedGroups: {
                    create: resolvedGroupIds.map((groupId) => ({ groupId })),
                  },
                }
              : {}),
          },
        });
      });
    };

    const attempts = [
      { includeCanComment: true, includeTaskGroups: true },
      { includeCanComment: false, includeTaskGroups: true },
      { includeCanComment: true, includeTaskGroups: false },
      { includeCanComment: false, includeTaskGroups: false },
    ] as const;

    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        await runUpdate(attempt);
        lastError = null;
        break;
      } catch (error) {
        const missingCanComment =
          attempt.includeCanComment && hasAssigneeUpdate && isMissingTaskAssigneeCanCommentColumn(error);
        const missingTaskGroups =
          attempt.includeTaskGroups && hasGroupUpdate && isMissingTaskGroupAssignmentsTable(error);
        if (!missingCanComment && !missingTaskGroups) {
          throw error;
        }
        lastError = error;
      }
    }
    if (lastError) throw lastError;

    const fetched = await findTaskWithCompat(id, userId);
    if (!fetched.task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const task = fetched.task;
    const normalizedTaskAssignees = normalizeTaskAssigneesForResponse(
      task.assignees as Array<{
        id?: string;
        userId?: string;
        canComment?: boolean;
        user?: { id?: string; name?: string; fullname?: string };
      }>
    );
    const normalizedAssignedGroups = fetched.usedAttempt.includeTaskGroups
      ? normalizeTaskGroupsForResponse(
          (task as { assignedGroups?: Array<{ groupId?: string; group?: { id?: string; name?: string; color?: string } }> })
            .assignedGroups ?? []
        )
      : [];

    const assigneeUserIds = normalizedTaskAssignees
      .map((entry) => entry.user.id)
      .filter((idValue) => idValue.length > 0);
    const summaryParts: string[] = [];
    if (statusToUse !== undefined && statusToUse !== existing.status) {
      summaryParts.push(`status ${existing.status} -> ${task.status}`);
    }
    if (priority !== undefined && priority !== existing.priority) {
      summaryParts.push(`priority ${existing.priority} -> ${task.priority}`);
    }
    if (dueDate !== undefined) {
      const nextDue = task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "none";
      summaryParts.push(`due ${nextDue}`);
    }
    if (hasAssigneeUpdate) {
      const commentersCount = normalizedTaskAssignees.filter((entry) => Boolean(entry.canComment)).length;
      summaryParts.push(
        `assignees ${normalizedTaskAssignees.length} (${commentersCount} can comment)`
      );
    }
    if (hasGroupUpdate) {
      summaryParts.push(`groups ${normalizedAssignedGroups.length}`);
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
    const canDelete = canManageTasks;
    const conversationAuthorEditDeleteWindowMinutes =
      await getTaskConversationAuthorEditWindowMinutes();

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
      assignedGroups: normalizedAssignedGroups,
      canComment,
      canEditTask: true,
      canChangeStatus: true,
      canDelete,
      conversationAuthorEditDeleteWindowMinutes,
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
