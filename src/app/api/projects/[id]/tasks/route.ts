import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectReadAccess, requireProjectWriteAccess, type ProjectScope } from "@/lib/project-access";
import { loadProjectTaskStages, getDefaultStage } from "@/lib/workflow-config";
import {
  canCurrentUserCommentOnProjectTask,
  canCurrentUserViewProjectTask,
  isMissingProjectTaskAllowAssigneeCommentsColumn,
  isMissingProjectTaskAssigneeCanCommentColumn,
  isMissingProjectTaskAssigneesTable,
  normalizeProjectTaskAssigneePermissions,
  type ProjectTaskAssigneePermission,
} from "@/lib/project-task-access";
import { getTaskConversationAuthorEditWindowMinutes } from "@/lib/task-conversation-policy";
import type { UserAccess } from "@/lib/rbac";

const VALID_TASK_PRIORITIES = new Set(["low", "normal", "high"]);

function normalizeTaskStatus(stages: { key: string }[], value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace("-", "_");
  if (!normalized) return undefined;
  return stages.some((s) => s.key === normalized) ? normalized : undefined;
}

function normalizeTaskPriority(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return VALID_TASK_PRIORITIES.has(normalized) ? normalized : undefined;
}

function normalizeOptionalId(value?: string | null): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (["none", "null", "unassigned"].includes(normalized.toLowerCase())) return null;
  return normalized;
}

type TaskQueryFlags = {
  includeAllowAssigneeComments: boolean;
  includeTaskAssignees: boolean;
  includeTaskAssigneeCanComment: boolean;
};

function projectTaskSelect(flags: TaskQueryFlags) {
  return {
    id: true,
    projectId: true,
    phaseId: true,
    assigneeId: true,
    title: true,
    description: true,
    status: true,
    priority: true,
    dueDate: true,
    createdAt: true,
    updatedAt: true,
    ...(flags.includeAllowAssigneeComments ? { allowAssigneeComments: true } : {}),
    assignee: { select: { id: true, name: true, fullname: true, photoUrl: true } },
    phase: { select: { id: true, name: true } },
    ...(flags.includeTaskAssignees
      ? {
          assignees: {
            select: {
              userId: true,
              ...(flags.includeTaskAssigneeCanComment ? { canComment: true } : {}),
              user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
            },
          },
        }
      : {}),
  };
}

type RawTaskAssignee = {
  userId: string;
  canComment?: boolean;
  user?: { id: string; name: string; fullname: string; photoUrl: string | null };
};

type ProjectTaskRow = {
  id: string;
  projectId: string;
  phaseId: string | null;
  assigneeId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  allowAssigneeComments?: boolean;
  assignee: { id: string; name: string; fullname: string; photoUrl: string | null } | null;
  phase: { id: string; name: string } | null;
  assignees?: RawTaskAssignee[];
};

type ProjectTaskNormalized = Omit<ProjectTaskRow, "allowAssigneeComments" | "assignees"> & {
  allowAssigneeComments: boolean;
  assignees: Array<{
    userId: string;
    canComment: boolean;
    user: { id: string; name: string; fullname: string; photoUrl: string | null };
  }>;
};

function toKnownProjectTask(raw: ProjectTaskRow, flags: TaskQueryFlags): ProjectTaskNormalized {
  const allowAssigneeComments = flags.includeAllowAssigneeComments
    ? Boolean(raw.allowAssigneeComments)
    : true;
  const assignees = flags.includeTaskAssignees
    ? (raw.assignees ?? [])
        .map((entry) => {
          const fallbackUser =
            raw.assignee && raw.assignee.id === entry.userId ? raw.assignee : null;
          const user = entry.user ?? fallbackUser;
          if (!user) return null;
          return {
            userId: entry.userId,
            canComment: flags.includeTaskAssigneeCanComment ? entry.canComment !== false : true,
            user,
          };
        })
        .filter((entry): entry is {
          userId: string;
          canComment: boolean;
          user: { id: string; name: string; fullname: string; photoUrl: string | null };
        } => entry !== null)
    : raw.assignee
      ? [
          {
            userId: raw.assignee.id,
            canComment: allowAssigneeComments,
            user: raw.assignee,
          },
        ]
      : [];

  return {
    ...raw,
    allowAssigneeComments,
    assignees,
    assignee:
      assignees[0]?.user ??
      raw.assignee,
    assigneeId:
      assignees[0]?.userId ??
      raw.assigneeId,
  };
}

function computeTaskPermissions(
  task: ProjectTaskNormalized,
  userId: string,
  access: UserAccess,
  scope: ProjectScope
) {
  const canViewTask = canCurrentUserViewProjectTask(
    { assigneeId: task.assigneeId, assignees: task.assignees },
    userId,
    access,
    scope
  );
  const canWriteTask = Boolean(
    (access.isAdmin || access.permissions.projects.write) &&
      scope.isMember &&
      canViewTask
  );
  const canDelete = Boolean(access.isAdmin || access.permissions.projects.manage || scope.isManager);
  const canComment = canCurrentUserCommentOnProjectTask(
    {
      id: task.id,
      assigneeId: task.assigneeId,
      allowAssigneeComments: task.allowAssigneeComments,
      assignees: task.assignees.map((entry) => ({
        userId: entry.userId,
        canComment: entry.canComment,
      })),
    },
    userId,
    access
  );

  return {
    canComment,
    canEditTask: canWriteTask,
    canChangeStatus: canWriteTask,
    canDelete,
  };
}

function isAllowAssigneeCommentsMissing(error: unknown) {
  if (isMissingProjectTaskAllowAssigneeCommentsColumn(error)) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    const meta = (error.meta ?? {}) as Record<string, unknown>;
    const column = String(meta.column ?? meta.field_name ?? "");
    return column.toLowerCase().includes("allowassigneecomments");
  }
  return false;
}

function buildTasksWhere(input: {
  projectId: string;
  phaseId: string | null;
  status: string | undefined;
  assigneeIdFilter: string | null;
  userId: string;
  canViewAllTasks: boolean;
  useAssigneeRelationFilter: boolean;
}) {
  const where: Record<string, unknown> = { projectId: input.projectId };
  if (input.phaseId) where.phaseId = input.phaseId;
  if (input.status) where.status = input.status;

  if (input.canViewAllTasks) {
    if (input.assigneeIdFilter) {
      if (input.useAssigneeRelationFilter) {
        where.OR = [
          { assigneeId: input.assigneeIdFilter },
          { assignees: { some: { userId: input.assigneeIdFilter } } },
        ];
      } else {
        where.assigneeId = input.assigneeIdFilter;
      }
    }
  } else if (input.useAssigneeRelationFilter) {
    where.OR = [
      { assigneeId: input.userId },
      { assignees: { some: { userId: input.userId } } },
    ];
  } else {
    where.assigneeId = input.userId;
  }

  return where;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId } = await params;
    const projectAccess = await requireProjectReadAccess(accessResult.ctx, projectId);
    if (!projectAccess.ok) return projectAccess.response;

    const stages = await loadProjectTaskStages();
    const conversationAuthorEditDeleteWindowMinutes =
      await getTaskConversationAuthorEditWindowMinutes();
    const { searchParams } = new URL(req.url);
    const phaseId = searchParams.get("phaseId");
    const status = normalizeTaskStatus(stages, searchParams.get("status"));
    const assigneeIdFilter = searchParams.get("assigneeId");

    const canViewAllTasks = Boolean(
      accessResult.ctx.access.isAdmin ||
        accessResult.ctx.access.permissions.projects.manage ||
        projectAccess.scope.isManager
    );

    const flags: TaskQueryFlags = {
      includeAllowAssigneeComments: true,
      includeTaskAssignees: true,
      includeTaskAssigneeCanComment: true,
    };
    let useAssigneeRelationFilter = true;
    let tasksRaw: ProjectTaskRow[] = [];
    while (true) {
      try {
        const where = buildTasksWhere({
          projectId,
          phaseId,
          status,
          assigneeIdFilter,
          userId: accessResult.ctx.userId,
          canViewAllTasks,
          useAssigneeRelationFilter,
        });
        tasksRaw = (await prisma.projectTask.findMany({
          where,
          orderBy: { createdAt: "desc" },
          select: projectTaskSelect(flags),
        })) as ProjectTaskRow[];
        break;
      } catch (error) {
        if (flags.includeAllowAssigneeComments && isAllowAssigneeCommentsMissing(error)) {
          flags.includeAllowAssigneeComments = false;
          continue;
        }
        if (
          flags.includeTaskAssigneeCanComment &&
          isMissingProjectTaskAssigneeCanCommentColumn(error)
        ) {
          flags.includeTaskAssigneeCanComment = false;
          continue;
        }
        if (isMissingProjectTaskAssigneesTable(error)) {
          flags.includeTaskAssignees = false;
          flags.includeTaskAssigneeCanComment = false;
          useAssigneeRelationFilter = false;
          continue;
        }
        throw error;
      }
    }

    const tasks = tasksRaw.map((raw) => {
      const task = toKnownProjectTask(raw, flags);
      return {
        ...task,
        ...computeTaskPermissions(
          task,
          accessResult.ctx.userId,
          accessResult.ctx.access,
          projectAccess.scope
        ),
        conversationAuthorEditDeleteWindowMinutes,
      };
    });

    return NextResponse.json({ items: tasks, stages });
  } catch (error) {
    console.error("[GET /api/projects/[id]/tasks]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, projectId);
    if (!projectAccess.ok) return projectAccess.response;

    const body = await req.json();
    const {
      title,
      description,
      phaseId,
      assigneeId,
      assignees,
      assigneeIds,
      status,
      priority,
      dueDate,
      allowAssigneeComments,
    } = body as {
      title: string;
      description?: string;
      phaseId?: string;
      assigneeId?: string;
      assignees?: unknown;
      assigneeIds?: unknown;
      status?: string;
      priority?: string;
      dueDate?: string;
      allowAssigneeComments?: boolean;
    };

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    if (allowAssigneeComments !== undefined && typeof allowAssigneeComments !== "boolean") {
      return NextResponse.json({ error: "allowAssigneeComments must be a boolean" }, { status: 400 });
    }

    const normalizedAssignees = normalizeProjectTaskAssigneePermissions({
      assignees,
      assigneeIds,
      assigneeId,
      allowAssigneeComments,
    });
    const primaryAssigneeId = normalizedAssignees[0]?.userId ?? null;
    const legacyAllowAssigneeComments = normalizedAssignees[0]?.canComment ?? (allowAssigneeComments ?? true);

    const ptStages = await loadProjectTaskStages();
    const defaultPtStage = getDefaultStage(ptStages);
    const conversationAuthorEditDeleteWindowMinutes =
      await getTaskConversationAuthorEditWindowMinutes();

    const normalizedPhaseId = normalizeOptionalId(phaseId);
    const normalizedStatus = normalizeTaskStatus(ptStages, status) ?? defaultPtStage.key;
    const normalizedPriority = normalizeTaskPriority(priority) ?? "normal";

    if (phaseId !== undefined && normalizedPhaseId === undefined) {
      return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    }

    if (status !== undefined && !normalizeTaskStatus(ptStages, status)) {
      return NextResponse.json({ error: "Invalid task status" }, { status: 400 });
    }

    if (priority !== undefined && !normalizeTaskPriority(priority)) {
      return NextResponse.json({ error: "Invalid task priority" }, { status: 400 });
    }

    if (normalizedAssignees.length > 0) {
      const membershipRows = await prisma.projectMember.findMany({
        where: {
          projectId,
          userId: { in: normalizedAssignees.map((entry) => entry.userId) },
        },
        select: { userId: true },
      });
      const memberIds = new Set(membershipRows.map((row) => row.userId));
      const invalid = normalizedAssignees
        .map((entry) => entry.userId)
        .filter((userId) => !memberIds.has(userId));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: "All assignees must be company members" },
          { status: 400 }
        );
      }
    }

    if (normalizedPhaseId) {
      const phase = await prisma.projectPhase.findFirst({
        where: { id: normalizedPhaseId, projectId },
        select: { id: true },
      });
      if (!phase) {
        return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
      }
    }

    const parsedDueDate = dueDate ? new Date(dueDate) : undefined;
    if (parsedDueDate && Number.isNaN(parsedDueDate.getTime())) {
      return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
    }

    const flags: TaskQueryFlags = {
      includeAllowAssigneeComments: true,
      includeTaskAssignees: true,
      includeTaskAssigneeCanComment: true,
    };
    let createdTaskId = "";
    while (true) {
      try {
        await prisma.$transaction(async (tx) => {
          const created = await tx.projectTask.create({
            data: {
              projectId,
              title: title.trim(),
              description,
              phaseId: normalizedPhaseId ?? null,
              assigneeId: primaryAssigneeId,
              status: normalizedStatus,
              priority: normalizedPriority,
              ...(flags.includeAllowAssigneeComments
                ? { allowAssigneeComments: legacyAllowAssigneeComments }
                : {}),
              dueDate: parsedDueDate,
            },
            select: { id: true },
          });
          createdTaskId = created.id;

          if (flags.includeTaskAssignees && normalizedAssignees.length > 0) {
            await tx.projectTaskAssignee.createMany({
              data: normalizedAssignees.map((entry) => ({
                projectTaskId: created.id,
                userId: entry.userId,
                ...(flags.includeTaskAssigneeCanComment ? { canComment: entry.canComment } : {}),
              })),
              skipDuplicates: true,
            });
          }
        });
        break;
      } catch (error) {
        if (flags.includeAllowAssigneeComments && isAllowAssigneeCommentsMissing(error)) {
          flags.includeAllowAssigneeComments = false;
          continue;
        }
        if (
          flags.includeTaskAssigneeCanComment &&
          isMissingProjectTaskAssigneeCanCommentColumn(error)
        ) {
          flags.includeTaskAssigneeCanComment = false;
          continue;
        }
        if (flags.includeTaskAssignees && isMissingProjectTaskAssigneesTable(error)) {
          if (normalizedAssignees.length > 1) {
            return NextResponse.json(
              { error: "Multi-assignee requires database update. Run database push/migrate first." },
              { status: 400 }
            );
          }
          flags.includeTaskAssignees = false;
          flags.includeTaskAssigneeCanComment = false;
          continue;
        }
        throw error;
      }
    }

    const taskRaw = (await prisma.projectTask.findUnique({
      where: { id: createdTaskId },
      select: projectTaskSelect(flags),
    })) as ProjectTaskRow | null;
    if (!taskRaw) {
      return NextResponse.json({ error: "Task not found after create" }, { status: 404 });
    }
    const task = toKnownProjectTask(taskRaw, flags);

    return NextResponse.json(
      {
        ...task,
        ...computeTaskPermissions(
          task,
          accessResult.ctx.userId,
          accessResult.ctx.access,
          projectAccess.scope
        ),
        conversationAuthorEditDeleteWindowMinutes,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/projects/[id]/tasks]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
