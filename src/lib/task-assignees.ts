export type TaskAssigneePermission = {
  userId: string;
  canComment: boolean;
};

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

export function normalizeTaskAssigneePermissions(input: {
  assignees?: unknown;
  assigneeIds?: unknown;
}): TaskAssigneePermission[] {
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

  return Array.from(byUserId.entries()).map(([userId, canComment]) => ({
    userId,
    canComment,
  }));
}

