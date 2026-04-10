import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectReadAccess, requireProjectWriteAccess, type ProjectScope } from "@/lib/project-access";
import { loadProjectTaskStages, getDefaultStage } from "@/lib/workflow-config";
import {
  canCurrentUserCommentOnProjectTask,
  isMissingProjectTaskAllowAssigneeCommentsColumn,
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

function projectTaskSelect(includeAllowAssigneeComments: boolean) {
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
    ...(includeAllowAssigneeComments ? { allowAssigneeComments: true } : {}),
    assignee: { select: { id: true, name: true, fullname: true, photoUrl: true } },
    phase: { select: { id: true, name: true } },
  };
}

type ProjectTaskRow = Awaited<
  | {
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
    }
  | null
>;

type ProjectTaskNormalized = Exclude<ProjectTaskRow, null> & {
  allowAssigneeComments: boolean;
};

function toKnownProjectTask(raw: ProjectTaskRow, includeAllowAssigneeComments: boolean): ProjectTaskNormalized {
  if (!raw) throw new Error("Project task not found");
  return {
    ...raw,
    allowAssigneeComments: includeAllowAssigneeComments
      ? Boolean((raw as { allowAssigneeComments?: boolean }).allowAssigneeComments)
      : true,
  };
}

function computeTaskPermissions(
  task: ProjectTaskNormalized,
  userId: string,
  access: UserAccess,
  scope: ProjectScope
) {
  const canViewAllTasks = Boolean(
    access.isAdmin || access.permissions.projects.manage || scope.isManager
  );
  const canViewTask = canViewAllTasks || task.assigneeId === userId;
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
    const assigneeId = searchParams.get("assigneeId");

    const canViewAllTasks = Boolean(
      accessResult.ctx.access.isAdmin ||
        accessResult.ctx.access.permissions.projects.manage ||
        projectAccess.scope.isManager
    );
    const where: Record<string, unknown> = { projectId };

    if (phaseId) where.phaseId = phaseId;
    if (status) where.status = status;
    if (canViewAllTasks) {
      if (assigneeId) where.assigneeId = assigneeId;
    } else {
      where.assigneeId = accessResult.ctx.userId;
    }

    let includeAllowAssigneeComments = true;
    let tasksRaw: ProjectTaskRow[] = [];
    try {
      tasksRaw = await prisma.projectTask.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: projectTaskSelect(true),
      });
    } catch (error) {
      if (!isAllowAssigneeCommentsMissing(error)) throw error;
      includeAllowAssigneeComments = false;
      tasksRaw = await prisma.projectTask.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: projectTaskSelect(false),
      });
    }

    const tasks = tasksRaw.map((raw) => {
      const task = toKnownProjectTask(raw, includeAllowAssigneeComments);
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
    const { title, description, phaseId, assigneeId, status, priority, dueDate, allowAssigneeComments } =
      body as {
        title: string;
        description?: string;
        phaseId?: string;
        assigneeId?: string;
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

    const ptStages = await loadProjectTaskStages();
    const defaultPtStage = getDefaultStage(ptStages);
    const conversationAuthorEditDeleteWindowMinutes =
      await getTaskConversationAuthorEditWindowMinutes();

    const normalizedAssigneeId = normalizeOptionalId(assigneeId);
    const normalizedPhaseId = normalizeOptionalId(phaseId);
    const normalizedStatus = normalizeTaskStatus(ptStages, status) ?? defaultPtStage.key;
    const normalizedPriority = normalizeTaskPriority(priority) ?? "normal";

    if (assigneeId !== undefined && normalizedAssigneeId === undefined) {
      return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
    }

    if (phaseId !== undefined && normalizedPhaseId === undefined) {
      return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    }

    if (status !== undefined && !normalizeTaskStatus(ptStages, status)) {
      return NextResponse.json({ error: "Invalid task status" }, { status: 400 });
    }

    if (priority !== undefined && !normalizeTaskPriority(priority)) {
      return NextResponse.json({ error: "Invalid task priority" }, { status: 400 });
    }

    if (normalizedAssigneeId) {
      const assigneeMembership = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: normalizedAssigneeId } },
        select: { id: true },
      });
      if (!assigneeMembership) {
        return NextResponse.json(
          { error: "Assignee must be a project member" },
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

    let includeAllowAssigneeComments = true;
    let createdTaskId = "";
    try {
      const created = await prisma.projectTask.create({
        data: {
          projectId,
          title: title.trim(),
          description,
          phaseId: normalizedPhaseId ?? null,
          assigneeId: normalizedAssigneeId ?? null,
          status: normalizedStatus,
          priority: normalizedPriority,
          allowAssigneeComments: allowAssigneeComments ?? true,
          dueDate: parsedDueDate,
        },
        select: { id: true },
      });
      createdTaskId = created.id;
    } catch (error) {
      if (!isAllowAssigneeCommentsMissing(error)) throw error;
      includeAllowAssigneeComments = false;
      const created = await prisma.projectTask.create({
        data: {
          projectId,
          title: title.trim(),
          description,
          phaseId: normalizedPhaseId ?? null,
          assigneeId: normalizedAssigneeId ?? null,
          status: normalizedStatus,
          priority: normalizedPriority,
          dueDate: parsedDueDate,
        },
        select: { id: true },
      });
      createdTaskId = created.id;
    }

    const taskRaw = await prisma.projectTask.findUnique({
      where: { id: createdTaskId },
      select: projectTaskSelect(includeAllowAssigneeComments),
    });
    if (!taskRaw) {
      return NextResponse.json({ error: "Task not found after create" }, { status: 404 });
    }
    const task = toKnownProjectTask(taskRaw, includeAllowAssigneeComments);

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
