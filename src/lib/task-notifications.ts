import { prisma } from "@/lib/prisma";
import { buildUserAccess } from "@/lib/rbac";
import { canAccess } from "@/lib/permissions";

type NotifyTaskChangeInput = {
  action: "created" | "updated";
  taskId: string;
  taskTitle: string;
  creatorId: string;
  assigneeIds: string[];
  actorUserId: string;
  isPrivate: boolean;
  summary?: string;
};

type NotifyTaskConversationInput = {
  taskId: string;
  taskTitle: string;
  creatorId: string;
  assigneeIds: string[];
  actorUserId: string;
  isPrivate: boolean;
  commentPreview?: string;
  repliedToUserId?: string | null;
};

function displayName(user: { fullname?: string | null; name?: string | null }) {
  const full = user.fullname?.trim();
  if (full) return full;
  const short = user.name?.trim();
  if (short) return short;
  return "A user";
}

async function resolveTaskRecipients(input: {
  creatorId: string;
  assigneeIds: string[];
  actorUserId: string;
  isPrivate: boolean;
}): Promise<string[]> {
  const directRelated = new Set<string>([input.creatorId, ...input.assigneeIds]);
  const recipientCandidates = new Set<string>(directRelated);

  // Private tasks stay limited to creator + assignees.
  if (!input.isPrivate && directRelated.size > 0) {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: { in: Array.from(directRelated) } },
      select: { groupId: true },
    });
    const groupIds = Array.from(new Set(memberships.map((entry) => entry.groupId)));
    if (groupIds.length > 0) {
      const groupMembers = await prisma.groupMember.findMany({
        where: { groupId: { in: groupIds } },
        select: { userId: true },
      });
      for (const member of groupMembers) recipientCandidates.add(member.userId);
    }
  }

  recipientCandidates.delete(input.actorUserId);
  if (recipientCandidates.size === 0) return [];

  const activeUsers = await prisma.user.findMany({
    where: {
      id: { in: Array.from(recipientCandidates) },
      isActive: true,
    },
    select: { id: true },
  });
  if (activeUsers.length === 0) return [];

  const accessChecks = await Promise.all(
    activeUsers.map(async (user) => {
      const access = await buildUserAccess(user.id);
      return access && canAccess(access.permissions, "tasks", "read") ? user.id : null;
    })
  );
  const allowedRecipients = accessChecks.filter((value): value is string => Boolean(value));
  return allowedRecipients;
}

function taskLink(taskId: string) {
  return `/tasks/${taskId}`;
}

function normalizePreview(input: string | undefined, maxLength = 180) {
  const text = (input ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

export async function notifyTaskChange(input: NotifyTaskChangeInput) {
  const allowedRecipients = await resolveTaskRecipients(input);
  if (allowedRecipients.length === 0) return;

  const actor = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { name: true, fullname: true },
  });
  const actorName = displayName(actor ?? {});
  const actionLabel = input.action === "created" ? "created" : "updated";

  const body = input.summary?.trim()
    ? `${actorName} ${actionLabel} "${input.taskTitle}": ${input.summary.trim()}`
    : `${actorName} ${actionLabel} "${input.taskTitle}".`;

  await prisma.notification.createMany({
    data: allowedRecipients.map((userId) => ({
      userId,
      type: "task",
      title: input.action === "created" ? "New Task Assigned" : "Task Updated",
      body: body.slice(0, 260),
      link: taskLink(input.taskId),
      isRead: false,
    })),
  });
}

export async function notifyTaskConversation(input: NotifyTaskConversationInput) {
  const allowedRecipients = await resolveTaskRecipients(input);
  if (allowedRecipients.length === 0) return;

  const actor = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { name: true, fullname: true },
  });
  const actorName = displayName(actor ?? {});
  const preview = normalizePreview(input.commentPreview);
  const defaultBody = preview
    ? `${actorName} commented on "${input.taskTitle}": ${preview}`
    : `${actorName} commented on "${input.taskTitle}".`;

  await prisma.notification.createMany({
    data: allowedRecipients.map((userId) => {
      const isDirectReply =
        input.repliedToUserId != null &&
        input.repliedToUserId.length > 0 &&
        input.repliedToUserId === userId;
      const title = isDirectReply ? "Task Reply" : "Task Comment";
      return {
        userId,
        type: isDirectReply ? "task_reply" : "task_comment",
        title,
        body: defaultBody.slice(0, 260),
        link: taskLink(input.taskId),
        isRead: false,
      };
    }),
  });
}
