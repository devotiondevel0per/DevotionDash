import { Prisma, type PrismaClient } from "@prisma/client";
import type { UserAccess } from "@/lib/rbac";

export type ProjectTaskAssigneePermission = {
  userId: string;
  canComment: boolean;
};

export type ProjectTaskCommentAccessInfo = {
  id: string;
  assigneeId: string | null;
  allowAssigneeComments: boolean;
  assignees: ProjectTaskAssigneePermission[];
};

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

export function isMissingProjectTaskAllowAssigneeCommentsColumn(error: unknown) {
  return isMissingColumn(error, "allowassigneecomments");
}

export function isMissingProjectTaskAssigneeCanCommentColumn(error: unknown) {
  return isMissingColumn(error, "cancomment");
}

export function isMissingProjectTaskAssigneesTable(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = (error.meta ?? {}) as Record<string, unknown>;
    const target = String(meta.table ?? meta.modelName ?? meta.cause ?? "");
    if (/project_task_assignees/i.test(target)) return true;
    if (error.code === "P2021" && /project_task_assignees/i.test(String(meta.table ?? ""))) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /project_task_assignees/i.test(message) && /(doesn't exist|unknown table|p2021)/i.test(message);
}

export function isMissingProjectTaskCommentParentColumn(error: unknown) {
  return isMissingColumn(error, "parentcommentid");
}

type RawAssignee =
  | string
  | {
      userId?: unknown;
      canComment?: unknown;
    };

function normalizeUserId(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function normalizeProjectTaskAssigneePermissions(input: {
  assignees?: unknown;
  assigneeIds?: unknown;
  assigneeId?: unknown;
  allowAssigneeComments?: unknown;
}): ProjectTaskAssigneePermission[] {
  const byUserId = new Map<string, boolean>();

  if (Array.isArray(input.assigneeIds)) {
    for (const rawUserId of input.assigneeIds) {
      const userId = normalizeUserId(rawUserId);
      if (!userId) continue;
      byUserId.set(userId, true);
    }
  }

  if (Array.isArray(input.assignees)) {
    for (const raw of input.assignees as RawAssignee[]) {
      if (typeof raw === "string") {
        const userId = normalizeUserId(raw);
        if (!userId) continue;
        byUserId.set(userId, true);
        continue;
      }
      if (!raw || typeof raw !== "object") continue;
      const userId = normalizeUserId(raw.userId);
      if (!userId) continue;
      byUserId.set(userId, raw.canComment !== false);
    }
  }

  const legacyAssigneeId = normalizeUserId(input.assigneeId);
  if (legacyAssigneeId && !byUserId.has(legacyAssigneeId)) {
    byUserId.set(legacyAssigneeId, input.allowAssigneeComments !== false);
  }

  return Array.from(byUserId.entries()).map(([userId, canComment]) => ({
    userId,
    canComment,
  }));
}

export function canCurrentUserViewProjectTask(
  task: { assigneeId: string | null; assignees?: ProjectTaskAssigneePermission[] },
  currentUserId: string,
  access: UserAccess,
  scope: { isManager: boolean }
) {
  if (access.isAdmin || access.permissions.projects.manage || scope.isManager) return true;
  if (Array.isArray(task.assignees) && task.assignees.length > 0) {
    return task.assignees.some((entry) => entry.userId === currentUserId);
  }
  if (!task.assigneeId) return false;
  return task.assigneeId === currentUserId;
}

export async function loadProjectTaskCommentAccessInfo(
  db: PrismaClient,
  taskId: string
): Promise<ProjectTaskCommentAccessInfo | null> {
  try {
    return await db.projectTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        assigneeId: true,
        allowAssigneeComments: true,
        assignees: {
          select: {
            userId: true,
            canComment: true,
          },
        },
      },
    });
  } catch (error) {
    if (
      !isMissingProjectTaskAllowAssigneeCommentsColumn(error) &&
      !isMissingProjectTaskAssigneesTable(error) &&
      !isMissingProjectTaskAssigneeCanCommentColumn(error)
    ) {
      throw error;
    }
  }

  try {
    const taskWithAssignees = await db.projectTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        assigneeId: true,
        allowAssigneeComments: true,
        assignees: {
          select: {
            userId: true,
          },
        },
      },
    });
    if (!taskWithAssignees) return null;
    return {
      ...taskWithAssignees,
      assignees: taskWithAssignees.assignees.map((entry) => ({
        userId: entry.userId,
        canComment: true,
      })),
    };
  } catch (error) {
    if (!isMissingProjectTaskAssigneesTable(error)) {
      throw error;
    }
  }

  const legacyTask = await db.projectTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      assigneeId: true,
      allowAssigneeComments: true,
    },
  });
  if (legacyTask) {
    return {
      ...legacyTask,
      assignees: legacyTask.assigneeId
        ? [
            {
              userId: legacyTask.assigneeId,
              canComment: legacyTask.allowAssigneeComments,
            },
          ]
        : [],
    };
  }

  const legacyNoCommentColumn = await db.projectTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      assigneeId: true,
    },
  });
  if (!legacyNoCommentColumn) return null;
  return {
    ...legacyNoCommentColumn,
    allowAssigneeComments: true,
    assignees: legacyNoCommentColumn.assigneeId
      ? [{ userId: legacyNoCommentColumn.assigneeId, canComment: true }]
      : [],
  };
}

export function canCurrentUserCommentOnProjectTask(
  task: ProjectTaskCommentAccessInfo,
  currentUserId: string,
  access: UserAccess
) {
  if (access.isAdmin || access.permissions.projects.manage) return true;
  if (Array.isArray(task.assignees) && task.assignees.length > 0) {
    const match = task.assignees.find((entry) => entry.userId === currentUserId);
    return Boolean(match?.canComment);
  }
  if (!task.assigneeId) return false;
  if (task.assigneeId !== currentUserId) return false;
  return task.allowAssigneeComments;
}
