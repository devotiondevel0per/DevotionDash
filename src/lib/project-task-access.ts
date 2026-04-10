import { Prisma, type PrismaClient } from "@prisma/client";
import type { UserAccess } from "@/lib/rbac";

export type ProjectTaskCommentAccessInfo = {
  id: string;
  assigneeId: string | null;
  allowAssigneeComments: boolean;
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

export function isMissingProjectTaskCommentParentColumn(error: unknown) {
  return isMissingColumn(error, "parentcommentid");
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
      },
    });
  } catch (error) {
    if (!isMissingProjectTaskAllowAssigneeCommentsColumn(error)) throw error;
    const legacyTask = await db.projectTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        assigneeId: true,
      },
    });
    if (!legacyTask) return null;
    return {
      ...legacyTask,
      allowAssigneeComments: true,
    };
  }
}

export function canCurrentUserCommentOnProjectTask(
  task: ProjectTaskCommentAccessInfo,
  currentUserId: string,
  access: UserAccess
) {
  if (access.isAdmin || access.permissions.projects.manage) return true;
  if (!task.assigneeId) return false;
  if (task.assigneeId !== currentUserId) return false;
  return task.allowAssigneeComments;
}
