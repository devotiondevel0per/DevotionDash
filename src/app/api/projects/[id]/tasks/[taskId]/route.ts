import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectWriteAccess, type ProjectScope } from "@/lib/project-access";
import { loadProjectTaskStages } from "@/lib/workflow-config";
import {
  canCurrentUserCommentOnProjectTask,
  canCurrentUserViewProjectTask,
  isMissingProjectTaskAllowAssigneeCommentsColumn,
  isMissingProjectTaskAssigneeCanCommentColumn,
  isMissingProjectTaskAssigneesTable,
  normalizeProjectTaskAssigneePermissions,
} from "@/lib/project-task-access";
import { getTaskConversationAuthorEditWindowMinutes } from "@/lib/task-conversation-policy";
import type { UserAccess } from "@/lib/rbac";

const VALID_TASK_PRIORITIES = new Set(["low", "normal", "high"]);

type TaskQueryFlags = {
  includeAllowAssigneeComments: boolean;
  includeTaskAssignees: boolean;
  includeTaskAssigneeCanComment: boolean;
};

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

async function buildTaskStatusNormalizer() {
  const stages = await loadProjectTaskStages();
  const validKeys = new Set(stages.map((s) => s.key));
  return (value?: string | null): string | undefined => {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim().toLowerCase().replace("-", "_");
    if (!normalized) return undefined;
    return validKeys.has(normalized) ? normalized : undefined;
  };
}

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
      ? [{ userId: raw.assignee.id, canComment: allowAssigneeComments, user: raw.assignee }]
      : [];

  return {
    ...raw,
    allowAssigneeComments,
    assignees,
    assignee: assignees[0]?.user ?? raw.assignee,
    assigneeId: assignees[0]?.userId ?? raw.assigneeId,
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
  return isMissingProjectTaskAllowAssigneeCommentsColumn(error);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId, taskId } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, projectId);
    if (!projectAccess.ok) return projectAccess.response;

    const body = (await req.json()) as {
      title?: string;
      description?: string | null;
      status?: string;
      priority?: string;
      assigneeId?: string | null;
      assignees?: unknown;
      assigneeIds?: unknown;
      phaseId?: string | null;
      dueDate?: string | null;
      allowAssigneeComments?: boolean;
    };

    const hasAssigneePayload =
      body.assignees !== undefined ||
      body.assigneeIds !== undefined ||
      body.assigneeId !== undefined;
    const normalizedAssignees = hasAssigneePayload
      ? normalizeProjectTaskAssigneePermissions({
          assignees: body.assignees,
          assigneeIds: body.assigneeIds,
          assigneeId: body.assigneeId ?? undefined,
          allowAssigneeComments: body.allowAssigneeComments,
        })
      : [];
    const primaryAssigneeId = hasAssigneePayload ? (normalizedAssignees[0]?.userId ?? null) : undefined;
    const legacyAllowAssigneeComments = hasAssigneePayload
      ? (normalizedAssignees[0]?.canComment ?? (body.allowAssigneeComments ?? true))
      : body.allowAssigneeComments;

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim() === "") {
        return NextResponse.json({ error: "title is required" }, { status: 400 });
      }
    }

    if (
      body.allowAssigneeComments !== undefined &&
      typeof body.allowAssigneeComments !== "boolean"
    ) {
      return NextResponse.json({ error: "allowAssigneeComments must be a boolean" }, { status: 400 });
    }

    const normalizedPhaseId = normalizeOptionalId(body.phaseId);
    const statusNormalizer = await buildTaskStatusNormalizer();
    const normalizedStatus =
      body.status !== undefined ? statusNormalizer(body.status) : undefined;
    const normalizedPriority =
      body.priority !== undefined ? normalizeTaskPriority(body.priority) : undefined;

    if (body.phaseId !== undefined && normalizedPhaseId === undefined) {
      return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    }

    if (body.status !== undefined && !normalizedStatus) {
      return NextResponse.json({ error: "Invalid task status" }, { status: 400 });
    }

    if (body.priority !== undefined && !normalizedPriority) {
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

    const parsedDueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.dueDate !== undefined && body.dueDate !== null && Number.isNaN(parsedDueDate?.getTime())) {
      return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
    }

    const flags: TaskQueryFlags = {
      includeAllowAssigneeComments: true,
      includeTaskAssignees: true,
      includeTaskAssigneeCanComment: true,
    };
    let taskRaw: ProjectTaskRow | null = null;
    while (true) {
      try {
        const existingTask = (await prisma.projectTask.findFirst({
          where: { id: taskId, projectId },
          select: projectTaskSelect(flags),
        })) as ProjectTaskRow | null;
        if (!existingTask) {
          return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }
        const existingNormalized = toKnownProjectTask(existingTask, flags);
        const canViewAllTasks = Boolean(
          accessResult.ctx.access.isAdmin ||
            accessResult.ctx.access.permissions.projects.manage ||
            projectAccess.scope.isManager
        );
        if (
          !canViewAllTasks &&
          !canCurrentUserViewProjectTask(
            { assigneeId: existingNormalized.assigneeId, assignees: existingNormalized.assignees },
            accessResult.ctx.userId,
            accessResult.ctx.access,
            projectAccess.scope
          )
        ) {
          return NextResponse.json({ error: "Forbidden: task access denied" }, { status: 403 });
        }

        await prisma.$transaction(async (tx) => {
          await tx.projectTask.update({
            where: { id: taskId },
            data: {
              ...(body.title !== undefined && { title: body.title.trim() }),
              ...(body.description !== undefined && { description: body.description }),
              ...(body.status !== undefined && { status: normalizedStatus }),
              ...(body.priority !== undefined && { priority: normalizedPriority }),
              ...(hasAssigneePayload && { assigneeId: primaryAssigneeId ?? null }),
              ...(body.phaseId !== undefined && { phaseId: normalizedPhaseId }),
              ...(body.dueDate !== undefined && {
                dueDate: body.dueDate ? parsedDueDate : null,
              }),
              ...(legacyAllowAssigneeComments !== undefined && flags.includeAllowAssigneeComments
                ? { allowAssigneeComments: legacyAllowAssigneeComments }
                : {}),
            },
            select: { id: true },
          });

          if (hasAssigneePayload && flags.includeTaskAssignees) {
            await tx.projectTaskAssignee.deleteMany({ where: { projectTaskId: taskId } });
            if (normalizedAssignees.length > 0) {
              await tx.projectTaskAssignee.createMany({
                data: normalizedAssignees.map((entry) => ({
                  projectTaskId: taskId,
                  userId: entry.userId,
                  ...(flags.includeTaskAssigneeCanComment ? { canComment: entry.canComment } : {}),
                })),
                skipDuplicates: true,
              });
            }
          }
        });

        taskRaw = (await prisma.projectTask.findUnique({
          where: { id: taskId },
          select: projectTaskSelect(flags),
        })) as ProjectTaskRow | null;
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
          if (hasAssigneePayload && normalizedAssignees.length > 1) {
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

    if (!taskRaw) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const task = toKnownProjectTask(taskRaw, flags);
    const conversationAuthorEditDeleteWindowMinutes =
      await getTaskConversationAuthorEditWindowMinutes();

    return NextResponse.json({
      ...task,
      ...computeTaskPermissions(
        task,
        accessResult.ctx.userId,
        accessResult.ctx.access,
        projectAccess.scope
      ),
      conversationAuthorEditDeleteWindowMinutes,
    });
  } catch (error) {
    console.error("[PUT /api/projects/[id]/tasks/[taskId]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId, taskId } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const canDelete =
      accessResult.ctx.access.isAdmin ||
      accessResult.ctx.access.permissions.projects.manage ||
      projectAccess.scope.isManager;
    if (!canDelete) {
      return NextResponse.json(
        { error: "Forbidden: project manager role required to delete tasks" },
        { status: 403 }
      );
    }

    const existingTask = await prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await prisma.projectTask.delete({ where: { id: taskId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/projects/[id]/tasks/[taskId]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
