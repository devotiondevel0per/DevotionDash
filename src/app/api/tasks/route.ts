import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { normalizeTaskAssigneePermissions } from "@/lib/task-assignees";
import { notifyTaskChange } from "@/lib/task-notifications";
import { isMissingTaskAssigneeCanCommentColumn } from "@/lib/task-access";
import { loadTaskStages, getDefaultStage, isClosedStage } from "@/lib/workflow-config";

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;
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

    if (view === "overview" && !isSubordinateCategory) {
      scopeFilters.push({
        OR: [{ creatorId: userId }, { assignees: { some: { userId } } }],
      });
    } else if (view === "personal" && !isSubordinateCategory) {
      scopeFilters.push({ creatorId: userId });
    } else if (view === "assigned" && !isSubordinateCategory) {
      scopeFilters.push({ assignees: { some: { userId } } });
    } else if (view === "groups" && !isSubordinateCategory) {
      if (groupedUserIds.length === 0) {
        scopeFilters.push({ id: "__none__" });
      } else {
        scopeFilters.push({
          OR: [
            { creatorId: { in: groupedUserIds } },
            { assignees: { some: { userId: { in: groupedUserIds } } } },
          ],
        });
      }
    }

    if (scopeFilters.length === 0 && !accessResult.ctx.access.isAdmin && !isSubordinateCategory) {
      scopeFilters.push({
        OR: [{ creatorId: userId }, { assignees: { some: { userId } } }],
      });
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
          // Fallback for setups without group hierarchy: show tasks created by other users.
          and.push({ creatorId: { not: userId } });
        }
      }

      where.AND = and;
    }

    const tasks = await prisma.task.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { id: true, name: true, fullname: true } },
        assignees: {
          select: {
            id: true,
            userId: true,
            user: { select: { id: true, name: true, fullname: true } },
          },
        },
        favorites: {
          where: { userId },
          select: { id: true },
        },
        _count: { select: { comments: true, favorites: true } },
      },
    });

    const enriched = tasks.map((task) => ({
      ...task,
      isFavorite: task.favorites.length > 0,
      favoriteCount: task._count.favorites,
      favorites: undefined,
    }));

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
    };

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const stages = await loadTaskStages();
    const defaultStage = getDefaultStage(stages);

    const statusToUse = typeof status === "string" && stages.some((stage) => stage.key === status)
      ? status
      : defaultStage.key;

    const normalizedAssignees = normalizeTaskAssigneePermissions({
      assignees,
      assigneeIds,
    });

    const buildAssigneeCreate = (includeCanComment: boolean) =>
      normalizedAssignees.map((entry) =>
        includeCanComment
          ? { userId: entry.userId, canComment: entry.canComment }
          : { userId: entry.userId }
      );

    const createPayload = (includeCanComment: boolean) => ({
      title: title.trim(),
      description,
      type: type ?? "task",
      status: statusToUse,
      priority: priority ?? "normal",
      isPrivate: isPrivate ?? false,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      completedAt: isClosedStage(stages, statusToUse) ? new Date() : null,
      creatorId: accessResult.ctx.userId,
      assignees: normalizedAssignees.length > 0
        ? {
            create: buildAssigneeCreate(includeCanComment),
          }
        : undefined,
    });

    const responseInclude = {
      creator: { select: { id: true, name: true, fullname: true } },
      assignees: {
        select: {
          id: true,
          userId: true,
          user: { select: { id: true, name: true, fullname: true } },
        },
      },
      favorites: {
        where: { userId: accessResult.ctx.userId },
        select: { id: true },
      },
      _count: { select: { comments: true, favorites: true } },
    } as const;

    let task;
    try {
      task = await prisma.task.create({
        data: createPayload(true),
        include: responseInclude,
      });
    } catch (error) {
      if (!(normalizedAssignees.length > 0 && isMissingTaskAssigneeCanCommentColumn(error))) {
        throw error;
      }
      task = await prisma.task.create({
        data: createPayload(false),
        include: responseInclude,
      });
    }
    const assigneeUserIds = task.assignees.map((entry) => entry.user.id);
    const summaryParts = [`status ${task.status}`, `priority ${task.priority}`];
    if (task.dueDate) summaryParts.push(`due ${task.dueDate.toISOString().slice(0, 10)}`);

    await notifyTaskChange({
      action: "created",
      taskId: task.id,
      taskTitle: task.title,
      creatorId: task.creatorId,
      assigneeIds: assigneeUserIds,
      actorUserId: accessResult.ctx.userId,
      isPrivate: task.isPrivate,
      summary: summaryParts.join(", "),
    }).catch((error) => {
      console.error("[tasks notify create]", error);
    });

    return NextResponse.json(
      {
        ...task,
        isFavorite: task.favorites.length > 0,
        favoriteCount: task._count.favorites,
        favorites: undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/tasks]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
