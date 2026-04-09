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
import { isMissingTaskAssigneeCanCommentColumn } from "@/lib/task-access";
import { loadTaskStages, getDefaultStage, isClosedStage } from "@/lib/workflow-config";
import { getTaskConversationAuthorEditWindowMinutes } from "@/lib/task-conversation-policy";

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

function normalizeAssigneesForResponse(
  assignees: Array<{
    id?: string;
    userId?: string;
    canComment?: boolean;
    user?: { id?: string; name?: string; fullname?: string };
  }>
) {
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

function normalizeAssignedGroupsForResponse(
  groups: Array<{
    groupId?: string;
    group?: { id?: string; name?: string; color?: string };
  }>
) {
  return groups
    .map((entry) => ({
      id: String(entry.group?.id ?? entry.groupId ?? ""),
      name: String(entry.group?.name ?? ""),
      color: String(entry.group?.color ?? "#94a3b8"),
  }))
    .filter((entry) => entry.id.length > 0);
}

function toPlainText(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchSnippet(content: string, searchTerm: string, radius = 70) {
  const source = toPlainText(content);
  if (!source) return "";
  const lowerSource = source.toLowerCase();
  const lowerSearch = searchTerm.toLowerCase();
  const idx = lowerSource.indexOf(lowerSearch);
  if (idx < 0) return "";
  const start = Math.max(0, idx - radius);
  const end = Math.min(source.length, idx + searchTerm.length + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < source.length ? "..." : "";
  return `${prefix}${source.slice(start, end)}${suffix}`.trim();
}

function listInclude(options: {
  userId: string;
  includeCanComment: boolean;
  includeTaskGroups: boolean;
  searchTerm?: string;
}) {
  const { userId, includeCanComment, includeTaskGroups, searchTerm } = options;
  return {
    creator: { select: { id: true, name: true, fullname: true } },
    assignees: {
      select: includeCanComment
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
          },
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
    favorites: {
      where: { userId },
      select: { id: true },
    },
    ...(searchTerm
      ? {
          comments: {
            where: { content: { contains: searchTerm } },
            orderBy: { createdAt: "desc" as const },
            take: 1,
            select: { content: true },
          },
        }
      : {}),
    _count: { select: { comments: true, favorites: true } },
  } as const;
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

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;
    const canManageTasks =
      accessResult.ctx.access.isAdmin || accessResult.ctx.access.permissions.tasks.manage;
    const canWriteTasks = canManageTasks || accessResult.ctx.access.permissions.tasks.write;
    const stages = await loadTaskStages();
    const { searchParams } = new URL(req.url);
    const view = (searchParams.get("view") ?? "overview").toLowerCase();
    const category = (searchParams.get("category") ?? "all").toLowerCase();
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const search = searchParams.get("search") ?? searchParams.get("subject");
    const assigneeId = searchParams.get("assigneeId");
    const authorId = searchParams.get("authorId");
    const periodFromRaw = searchParams.get("periodFrom");
    const periodToRaw = searchParams.get("periodTo");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

    const scopeFilters: Record<string, unknown>[] = [];
    const isSubordinateCategory = category === "subordinate";
    const groupIds = accessResult.ctx.access.roles.map((role) => role.groupId);
    let groupedUserIds: string[] = [];

    if (groupIds.length > 0 && (view === "groups" || category === "subordinate")) {
      const members = await prisma.groupMember.findMany({
        where: { groupId: { in: groupIds } },
        select: { userId: true },
      });
      groupedUserIds = Array.from(new Set(members.map((member) => member.userId)));
    }

    if (!canManageTasks && view === "overview" && !isSubordinateCategory) {
      scopeFilters.push({ assignees: { some: { userId } } });
    } else if (!canManageTasks && view === "personal" && !isSubordinateCategory) {
      scopeFilters.push({ creatorId: userId });
      scopeFilters.push({ assignees: { some: { userId } } });
    } else if (canManageTasks && view === "personal" && !isSubordinateCategory) {
      scopeFilters.push({ creatorId: userId });
    } else if (view === "assigned" && !isSubordinateCategory) {
      scopeFilters.push({ assignees: { some: { userId } } });
    } else if (!canManageTasks && view === "groups" && !isSubordinateCategory) {
      if (groupedUserIds.length === 0) {
        scopeFilters.push({ id: "__none__" });
      } else {
        scopeFilters.push({
          assignees: { some: { userId: { in: groupedUserIds } } },
        });
      }
    }

    if (scopeFilters.length === 0 && !canManageTasks && !isSubordinateCategory) {
      scopeFilters.push({ assignees: { some: { userId } } });
    }

    const where: Record<string, unknown> = scopeFilters.length > 0 ? { AND: [...scopeFilters] } : {};

    if (status && status !== "all") {
      const and = (where.AND as Record<string, unknown>[] | undefined) ?? [];
      and.push({ status });
      where.AND = and;
    }
    if (type && type !== "all") {
      const and = (where.AND as Record<string, unknown>[] | undefined) ?? [];
      and.push({ type });
      where.AND = and;
    }
    if (search) {
      const and = (where.AND as Record<string, unknown>[] | undefined) ?? [];
      and.push({
        OR: [
          { title: { contains: search } },
          { description: { contains: search } },
          { comments: { some: { content: { contains: search } } } },
        ],
      });
      where.AND = and;
    }
    if (assigneeId) {
      const and = (where.AND as Record<string, unknown>[] | undefined) ?? [];
      and.push({ assignees: { some: { userId: assigneeId } } });
      where.AND = and;
    }
    if (authorId) {
      const and = (where.AND as Record<string, unknown>[] | undefined) ?? [];
      and.push({ creatorId: authorId });
      where.AND = and;
    }

    if (periodFromRaw || periodToRaw) {
      const periodFilter: { gte?: Date; lte?: Date } = {};
      if (periodFromRaw) {
        const fromDate = new Date(periodFromRaw);
        if (!Number.isNaN(fromDate.getTime())) periodFilter.gte = fromDate;
      }
      if (periodToRaw) {
        const toDate = new Date(periodToRaw);
        if (!Number.isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          periodFilter.lte = toDate;
        }
      }
      if (periodFilter.gte || periodFilter.lte) {
        const and = (where.AND as Record<string, unknown>[] | undefined) ?? [];
        and.push({ dueDate: periodFilter });
        where.AND = and;
      }
    }

    if (category && category !== "all") {
      const and = (where.AND as Record<string, unknown>[] | undefined) ?? [];

      if (category === "open") {
        const openKeys = stages.filter((s) => !s.isClosed).map((s) => s.key);
        and.push({ status: openKeys.length === 1 ? openKeys[0] : { in: openKeys } });
      } else if (category === "closed") {
        const closedKeys = stages.filter((s) => s.isClosed).map((s) => s.key);
        if (closedKeys.length > 0) and.push({ status: { in: closedKeys } });
      } else if (category === "events") {
        and.push({ type: "event" });
      } else if (category === "notes") {
        and.push({ type: "note" });
      } else if (category === "favorites") {
        and.push({ favorites: { some: { userId } } });
      } else if (category === "subordinate") {
        const subordinateIds = groupedUserIds.filter((id) => id !== userId);
        if (subordinateIds.length > 0) {
          and.push({ creatorId: { in: subordinateIds } });
        } else {
          and.push({ creatorId: { not: userId } });
        }
      }

      where.AND = and;
    }

    const attempts = [
      { includeCanComment: true, includeTaskGroups: true },
      { includeCanComment: false, includeTaskGroups: true },
      { includeCanComment: true, includeTaskGroups: false },
      { includeCanComment: false, includeTaskGroups: false },
    ] as const;

    let tasks: Array<Record<string, unknown>> = [];
    let usedAttempt: (typeof attempts)[number] = attempts[attempts.length - 1];
    let loaded = false;
    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        tasks = (await prisma.task.findMany({
          where,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: listInclude({
            userId,
            includeCanComment: attempt.includeCanComment,
            includeTaskGroups: attempt.includeTaskGroups,
            searchTerm: search?.trim() ? search.trim() : undefined,
          }),
        })) as Array<Record<string, unknown>>;
        usedAttempt = attempt;
        loaded = true;
        break;
      } catch (error) {
        const missingCanComment =
          attempt.includeCanComment && isMissingTaskAssigneeCanCommentColumn(error);
        const missingTaskGroups =
          attempt.includeTaskGroups && isMissingTaskGroupAssignmentsTable(error);
        if (!missingCanComment && !missingTaskGroups) throw error;
        lastError = error;
      }
    }
    if (!loaded && lastError) throw lastError;

    const conversationAuthorEditDeleteWindowMinutes =
      await getTaskConversationAuthorEditWindowMinutes();

    const enriched = tasks.map((rawTask) => {
      const task = rawTask as {
        id: string;
        title?: string;
        description?: string | null;
        creatorId: string;
        assignees?: Array<{
          id?: string;
          userId?: string;
          canComment?: boolean;
          user?: { id?: string; name?: string; fullname?: string };
        }>;
        assignedGroups?: Array<{
          groupId?: string;
          group?: { id?: string; name?: string; color?: string };
        }>;
        comments?: Array<{ content?: string }>;
        favorites?: Array<{ id: string }>;
        _count?: { favorites?: number };
      };
      const normalizedAssignees = normalizeAssigneesForResponse(task.assignees ?? []);
      const normalizedGroups = usedAttempt.includeTaskGroups
        ? normalizeAssignedGroupsForResponse(task.assignedGroups ?? [])
        : [];
      const canComment =
        canManageTasks ||
        normalizedAssignees.some(
          (entry) => entry.userId === userId && Boolean(entry.canComment)
        );
      const searchSnippet =
        search && search.trim()
          ? buildSearchSnippet(
              String(task.description ?? task.title ?? ""),
              search.trim()
            ) ||
            buildSearchSnippet(
              String(task.comments?.[0]?.content ?? ""),
              search.trim()
            )
          : "";

      return {
        ...rawTask,
        assignees: normalizedAssignees,
        assignedGroups: normalizedGroups,
        searchMatchText: searchSnippet || null,
        canComment,
        canEditTask: canWriteTasks,
        canChangeStatus: canWriteTasks,
        canDelete: canManageTasks,
        conversationAuthorEditDeleteWindowMinutes,
        isFavorite: (task.favorites ?? []).length > 0,
        favoriteCount: Number(task._count?.favorites ?? 0),
        favorites: undefined,
      };
    });

    return NextResponse.json({ items: enriched, stages });
  } catch (error) {
    console.error("[GET /api/tasks]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("tasks", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const {
      title,
      description,
      type,
      status,
      priority,
      isPrivate,
      dueDate,
      assignees,
      assigneeIds,
      groupIds: rawGroupIds,
    } = body as {
      title: string;
      description?: string;
      type?: string;
      status?: string;
      priority?: string;
      isPrivate?: boolean;
      dueDate?: string;
      assignees?: Array<{ userId?: string; canComment?: boolean }>;
      assigneeIds?: string[];
      groupIds?: string[];
    };

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const stages = await loadTaskStages();
    const defaultStage = getDefaultStage(stages);
    const statusToUse =
      typeof status === "string" && stages.some((stage) => stage.key === status)
        ? status
        : defaultStage.key;

    const directAssignees = normalizeTaskAssigneePermissions({
      assignees,
      assigneeIds,
    });
    const requestedGroupIds = normalizeTaskGroupIds(rawGroupIds);

    let resolvedGroupIds: string[] = [];
    let groupMembers: string[] = [];
    if (requestedGroupIds.length > 0) {
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

    const normalizedAssignees = mergeAssigneesWithGroupMembers(directAssignees, groupMembers);
    const buildAssigneeCreate = (includeCanComment: boolean) =>
      normalizedAssignees.map((entry) =>
        includeCanComment
          ? { userId: entry.userId, canComment: entry.canComment }
          : { userId: entry.userId }
      );

    const createPayload = (includeCanComment: boolean, includeTaskGroups: boolean) => ({
      title: title.trim(),
      description,
      type: type ?? "task",
      status: statusToUse,
      priority: priority ?? "normal",
      isPrivate: isPrivate ?? false,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      completedAt: isClosedStage(stages, statusToUse) ? new Date() : null,
      creatorId: accessResult.ctx.userId,
      assignees:
        normalizedAssignees.length > 0
          ? {
              create: buildAssigneeCreate(includeCanComment),
            }
          : undefined,
      ...(includeTaskGroups && resolvedGroupIds.length > 0
        ? {
            assignedGroups: {
              create: resolvedGroupIds.map((groupId) => ({ groupId })),
            },
          }
        : {}),
    });

    const responseInclude = (includeCanComment: boolean, includeTaskGroups: boolean) =>
      ({
        creator: { select: { id: true, name: true, fullname: true } },
        assignees: {
          select: includeCanComment
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
              },
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
        favorites: {
          where: { userId: accessResult.ctx.userId },
          select: { id: true },
        },
        _count: { select: { comments: true, favorites: true } },
      }) as const;

    const attempts = [
      { includeCanComment: true, includeTaskGroups: true },
      { includeCanComment: false, includeTaskGroups: true },
      { includeCanComment: true, includeTaskGroups: false },
      { includeCanComment: false, includeTaskGroups: false },
    ] as const;

    let task: Record<string, unknown> | null = null;
    let usedAttempt: (typeof attempts)[number] = attempts[attempts.length - 1];
    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        task = (await prisma.task.create({
          data: createPayload(attempt.includeCanComment, attempt.includeTaskGroups),
          include: responseInclude(attempt.includeCanComment, attempt.includeTaskGroups),
        })) as Record<string, unknown>;
        usedAttempt = attempt;
        break;
      } catch (error) {
        const missingCanComment =
          attempt.includeCanComment && isMissingTaskAssigneeCanCommentColumn(error);
        const missingTaskGroups =
          attempt.includeTaskGroups && isMissingTaskGroupAssignmentsTable(error);
        if (!missingCanComment && !missingTaskGroups) throw error;
        lastError = error;
      }
    }

    if (!task) throw lastError;
    const typedTask = task as {
      id: string;
      title: string;
      status: string;
      priority: string;
      dueDate: Date | null;
      creatorId: string;
      isPrivate: boolean;
      assignees: Array<{
        id?: string;
        userId?: string;
        canComment?: boolean;
        user?: { id?: string; name?: string; fullname?: string };
      }>;
      assignedGroups?: Array<{
        groupId?: string;
        group?: { id?: string; name?: string; color?: string };
      }>;
      favorites?: Array<{ id: string }>;
      _count?: { favorites?: number };
    };

    const normalizedTaskAssignees = normalizeAssigneesForResponse(typedTask.assignees ?? []);
    const normalizedGroups = usedAttempt.includeTaskGroups
      ? normalizeAssignedGroupsForResponse(typedTask.assignedGroups ?? [])
      : [];
    const assigneeUserIds = normalizedTaskAssignees.map((entry) => entry.user.id).filter(Boolean);
    const summaryParts = [`status ${typedTask.status}`, `priority ${typedTask.priority}`];
    if (typedTask.dueDate) summaryParts.push(`due ${typedTask.dueDate.toISOString().slice(0, 10)}`);
    if (normalizedGroups.length > 0) summaryParts.push(`groups ${normalizedGroups.length}`);

    await notifyTaskChange({
      action: "created",
      taskId: typedTask.id,
      taskTitle: typedTask.title,
      creatorId: typedTask.creatorId,
      assigneeIds: assigneeUserIds,
      actorUserId: accessResult.ctx.userId,
      isPrivate: typedTask.isPrivate,
      summary: summaryParts.join(", "),
    }).catch((error) => {
      console.error("[tasks notify create]", error);
    });
    const conversationAuthorEditDeleteWindowMinutes =
      await getTaskConversationAuthorEditWindowMinutes();

    return NextResponse.json(
      {
        ...task,
        assignees: normalizedTaskAssignees,
        assignedGroups: normalizedGroups,
        canEditTask: true,
        canChangeStatus: true,
        canDelete: accessResult.ctx.access.isAdmin || accessResult.ctx.access.permissions.tasks.manage,
        canComment: true,
        conversationAuthorEditDeleteWindowMinutes,
        isFavorite: (typedTask.favorites ?? []).length > 0,
        favoriteCount: Number(typedTask._count?.favorites ?? 0),
        favorites: undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/tasks]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
