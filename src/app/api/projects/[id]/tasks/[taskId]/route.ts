import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectWriteAccess, type ProjectScope } from "@/lib/project-access";
import { loadProjectTaskStages } from "@/lib/workflow-config";
import {
  canCurrentUserCommentOnProjectTask,
  isMissingProjectTaskAllowAssigneeCommentsColumn,
} from "@/lib/project-task-access";
import { getTaskConversationAuthorEditWindowMinutes } from "@/lib/task-conversation-policy";
import type { UserAccess } from "@/lib/rbac";

const VALID_TASK_PRIORITIES = new Set(["low", "normal", "high"]);

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
};

type ProjectTaskNormalized = ProjectTaskRow & { allowAssigneeComments: boolean };

function toKnownProjectTask(raw: ProjectTaskRow, includeAllowAssigneeComments: boolean): ProjectTaskNormalized {
  return {
    ...raw,
    allowAssigneeComments: includeAllowAssigneeComments
      ? Boolean(raw.allowAssigneeComments)
      : true,
  };
}

function computeTaskPermissions(
  task: ProjectTaskNormalized,
  userId: string,
  access: UserAccess,
  scope: ProjectScope
) {
  const canWriteTask = Boolean((access.isAdmin || access.permissions.projects.write) && scope.isMember);
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

    const existingTask = await prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      title?: string;
      description?: string | null;
      status?: string;
      priority?: string;
      assigneeId?: string | null;
      phaseId?: string | null;
      dueDate?: string | null;
      allowAssigneeComments?: boolean;
    };

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

    const normalizedAssigneeId = normalizeOptionalId(body.assigneeId);
    const normalizedPhaseId = normalizeOptionalId(body.phaseId);
    const statusNormalizer = await buildTaskStatusNormalizer();
    const normalizedStatus =
      body.status !== undefined ? statusNormalizer(body.status) : undefined;
    const normalizedPriority =
      body.priority !== undefined ? normalizeTaskPriority(body.priority) : undefined;

    if (body.assigneeId !== undefined && normalizedAssigneeId === undefined) {
      return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
    }

    if (body.phaseId !== undefined && normalizedPhaseId === undefined) {
      return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    }

    if (body.status !== undefined && !normalizedStatus) {
      return NextResponse.json({ error: "Invalid task status" }, { status: 400 });
    }

    if (body.priority !== undefined && !normalizedPriority) {
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

    const parsedDueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.dueDate !== undefined && body.dueDate !== null && Number.isNaN(parsedDueDate?.getTime())) {
      return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
    }

    let includeAllowAssigneeComments = true;
    try {
      await prisma.projectTask.update({
        where: { id: taskId },
        data: {
          ...(body.title !== undefined && { title: body.title.trim() }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.status !== undefined && { status: normalizedStatus }),
          ...(body.priority !== undefined && { priority: normalizedPriority }),
          ...(body.assigneeId !== undefined && { assigneeId: normalizedAssigneeId }),
          ...(body.phaseId !== undefined && { phaseId: normalizedPhaseId }),
          ...(body.dueDate !== undefined && {
            dueDate: body.dueDate ? parsedDueDate : null,
          }),
          ...(body.allowAssigneeComments !== undefined && {
            allowAssigneeComments: body.allowAssigneeComments,
          }),
        },
        select: { id: true },
      });
    } catch (error) {
      if (!isMissingProjectTaskAllowAssigneeCommentsColumn(error)) throw error;
      includeAllowAssigneeComments = false;
      await prisma.projectTask.update({
        where: { id: taskId },
        data: {
          ...(body.title !== undefined && { title: body.title.trim() }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.status !== undefined && { status: normalizedStatus }),
          ...(body.priority !== undefined && { priority: normalizedPriority }),
          ...(body.assigneeId !== undefined && { assigneeId: normalizedAssigneeId }),
          ...(body.phaseId !== undefined && { phaseId: normalizedPhaseId }),
          ...(body.dueDate !== undefined && {
            dueDate: body.dueDate ? parsedDueDate : null,
          }),
        },
        select: { id: true },
      });
    }

    const taskRaw = await prisma.projectTask.findUnique({
      where: { id: taskId },
      select: projectTaskSelect(includeAllowAssigneeComments),
    });
    if (!taskRaw) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const task = toKnownProjectTask(taskRaw as ProjectTaskRow, includeAllowAssigneeComments);
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
