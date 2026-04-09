import { Prisma, type PrismaClient } from "@prisma/client";
import type { UserAccess } from "@/lib/rbac";

export type TaskCommentAccessInfo = {
  id: string;
  creatorId: string;
  assignees: Array<{ userId: string; canComment: boolean }>;
};

export function isMissingTaskAssigneeCanCommentColumn(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    const meta = (error.meta ?? {}) as Record<string, unknown>;
    const column = String(meta.column ?? meta.field_name ?? "");
    if (column.toLowerCase().includes("cancomment")) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /cancomment/i.test(message) && /(unknown column|doesn't exist|p2022|not found)/i.test(message);
}

export async function loadTaskCommentAccessInfo(
  db: PrismaClient,
  taskId: string,
  currentUserId: string
): Promise<TaskCommentAccessInfo | null> {
  try {
    return await db.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        creatorId: true,
        assignees: {
          where: { userId: currentUserId },
          select: { userId: true, canComment: true },
        },
      },
    });
  } catch (error) {
    if (!isMissingTaskAssigneeCanCommentColumn(error)) throw error;
    const legacyTask = await db.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        creatorId: true,
        assignees: {
          where: { userId: currentUserId },
          select: { userId: true },
        },
      },
    });
    if (!legacyTask) return null;
    return {
      ...legacyTask,
      assignees: legacyTask.assignees.map((assignee) => ({
        ...assignee,
        canComment: true,
      })),
    };
  }
}

export function canCurrentUserCommentOnTask(
  task: TaskCommentAccessInfo,
  currentUserId: string,
  access: UserAccess
) {
  if (access.isAdmin || access.permissions.tasks.manage) return true;
  const assignee = task.assignees.find((entry) => entry.userId === currentUserId);
  if (!assignee) return false;
  return assignee.canComment;
}
