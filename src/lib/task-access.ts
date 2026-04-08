import { Prisma, type PrismaClient } from "@prisma/client";
import type { UserAccess } from "@/lib/rbac";

export type TaskCommentAccessInfo = {
  id: string;
  creatorId: string;
  allowAssigneeComments: boolean;
  assignees: Array<{ userId: string }>;
};

export function isMissingAllowAssigneeCommentsColumn(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    const meta = (error.meta ?? {}) as Record<string, unknown>;
    const column = String(meta.column ?? meta.field_name ?? "");
    if (column.toLowerCase().includes("allowassigneecomments")) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /allowassigneecomments/i.test(message) && /(unknown column|doesn't exist|p2022|not found)/i.test(message);
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
        allowAssigneeComments: true,
        assignees: {
          where: { userId: currentUserId },
          select: { userId: true },
        },
      },
    });
  } catch (error) {
    if (!isMissingAllowAssigneeCommentsColumn(error)) throw error;
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
    return { ...legacyTask, allowAssigneeComments: true };
  }
}

export function canCurrentUserCommentOnTask(
  task: TaskCommentAccessInfo,
  currentUserId: string,
  access: UserAccess
) {
  if (access.isAdmin || access.permissions.tasks.manage) return true;
  if (task.creatorId === currentUserId) return true;
  const isAssignee = task.assignees.some((entry) => entry.userId === currentUserId);
  if (!isAssignee) return false;
  return task.allowAssigneeComments;
}
