import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectReadAccess, requireProjectWriteAccess } from "@/lib/project-access";
import { loadProjectTaskStages } from "@/lib/workflow-config";
import { loadProjectFormFields, sanitizeProjectCustomData } from "@/lib/project-form-config";
import { getTaskConversationAuthorEditWindowMinutes } from "@/lib/task-conversation-policy";
import {
  canCurrentUserCommentOnProjectTask,
  canCurrentUserViewProjectTask,
  isMissingProjectTaskAllowAssigneeCommentsColumn,
  isMissingProjectTaskAssigneeCanCommentColumn,
  isMissingProjectTaskAssigneesTable,
} from "@/lib/project-task-access";
import type { ProjectFormField } from "@/lib/project-form-config";

function normalizeCompanyStatus(value: unknown): "active" | "inactive" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "inactive" || normalized === "archived" || normalized === "completed") {
    return "inactive";
  }
  return "active";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mergeProjectCustomDataPreservingUnknown(
  existing: unknown,
  incoming: Record<string, unknown>,
  fields: ProjectFormField[]
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...asRecord(existing) };
  const editableFieldKeys = new Set(
    fields
      .filter((field) => field.source === "custom" && field.enabled)
      .map((field) => field.key)
  );

  for (const key of editableFieldKeys) {
    delete merged[key];
  }
  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = value;
  }

  return merged;
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const projectAccess = await requireProjectReadAccess(accessResult.ctx, id);
    if (!projectAccess.ok) return projectAccess.response;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        category: true,
        members: {
          include: {
            user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
          },
        },
        phases: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!project) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const taskStages = await loadProjectTaskStages();
    const conversationAuthorEditDeleteWindowMinutes =
      await getTaskConversationAuthorEditWindowMinutes();

    const flags: TaskQueryFlags = {
      includeAllowAssigneeComments: true,
      includeTaskAssignees: true,
      includeTaskAssigneeCanComment: true,
    };
    let tasks: Array<Record<string, unknown>> = [];
    while (true) {
      try {
        tasks = await prisma.projectTask.findMany({
          where: { projectId: id },
          orderBy: { createdAt: "desc" },
          select: projectTaskSelect(flags),
        });
        break;
      } catch (error) {
        if (
          flags.includeAllowAssigneeComments &&
          isMissingProjectTaskAllowAssigneeCommentsColumn(error)
        ) {
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
          continue;
        }
        throw error;
      }
    }

    const canWriteTask = Boolean(
      (accessResult.ctx.access.isAdmin || accessResult.ctx.access.permissions.projects.write) &&
        projectAccess.scope.isMember
    );
    const canDeleteTask = Boolean(
      accessResult.ctx.access.isAdmin ||
        accessResult.ctx.access.permissions.projects.manage ||
        projectAccess.scope.isManager
    );

    const normalizedTasks = tasks
      .filter((task) => {
        const rawTask = task as {
          assigneeId: string | null;
          assignees?: Array<{ userId: string; canComment?: boolean }>;
        };
        const normalizedAssignees = Array.isArray(rawTask.assignees)
          ? rawTask.assignees.map((entry) => ({
              userId: entry.userId,
              canComment: flags.includeTaskAssigneeCanComment ? entry.canComment !== false : true,
            }))
          : [];
        return canCurrentUserViewProjectTask(
          { assigneeId: rawTask.assigneeId, assignees: normalizedAssignees },
          accessResult.ctx.userId,
          accessResult.ctx.access,
          projectAccess.scope
        );
      })
      .map((task) => {
      const taskRecord = task as {
        id: string;
        assigneeId: string | null;
        allowAssigneeComments?: boolean;
        assignees?: Array<{
          userId: string;
          canComment?: boolean;
          user: { id: string; name: string; fullname: string; photoUrl: string | null };
        }>;
        assignee?: { id: string; name: string; fullname: string; photoUrl: string | null } | null;
      };
      const assignees = Array.isArray(taskRecord.assignees)
        ? taskRecord.assignees.map((entry) => ({
            userId: entry.userId,
            canComment: flags.includeTaskAssigneeCanComment ? entry.canComment !== false : true,
            user: entry.user,
          }))
        : taskRecord.assignee
          ? [{
              userId: taskRecord.assignee.id,
              canComment: flags.includeAllowAssigneeComments
                ? Boolean(taskRecord.allowAssigneeComments)
                : true,
              user: taskRecord.assignee,
            }]
          : [];
      const assigneeId = assignees[0]?.userId ?? taskRecord.assigneeId;
      const allowAssigneeComments = flags.includeAllowAssigneeComments
        ? Boolean(taskRecord.allowAssigneeComments)
        : true;
      const canViewTask = canCurrentUserViewProjectTask(
        { assigneeId, assignees },
        accessResult.ctx.userId,
        accessResult.ctx.access,
        projectAccess.scope
      );
      const canComment = canCurrentUserCommentOnProjectTask(
        {
          id: taskRecord.id,
          assigneeId,
          allowAssigneeComments,
          assignees: assignees.map((entry) => ({
            userId: entry.userId,
            canComment: entry.canComment,
          })),
        },
        accessResult.ctx.userId,
        accessResult.ctx.access
      );

      return {
        ...task,
        assigneeId,
        assignee: assignees[0]?.user ?? taskRecord.assignee ?? null,
        assignees,
        allowAssigneeComments,
        canComment,
        canEditTask: canWriteTask && canViewTask,
        canChangeStatus: canWriteTask && canViewTask,
        canDelete: canDeleteTask,
        conversationAuthorEditDeleteWindowMinutes,
      };
    });

    return NextResponse.json({
      ...project,
      status: normalizeCompanyStatus(project.status),
      tasks: normalizedTasks,
      taskStages,
    });
  } catch (error) {
    console.error("[GET /api/projects/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, id, {
      managerOnly: true,
    });
    if (!projectAccess.ok) return projectAccess.response;

    const body = await req.json();
    const { name, description, status, startDate, endDate, categoryId, customData } = body as {
      name?: string;
      description?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      categoryId?: string | null;
      customData?: unknown;
    };

    const fields = await loadProjectFormFields();
    const normalizedStatus = status !== undefined ? normalizeCompanyStatus(status) : undefined;
    let mergedCustomData: Prisma.InputJsonValue | undefined;

    if (customData !== undefined) {
      const existingProject = await prisma.project.findUnique({
        where: { id },
        select: {
          name: true,
          description: true,
          status: true,
          startDate: true,
          endDate: true,
          categoryId: true,
          customData: true,
        },
      });
      if (!existingProject) {
        return NextResponse.json({ error: "Company not found" }, { status: 404 });
      }

      const normalizedCustomData = sanitizeProjectCustomData(customData, fields, {
        name: name ?? existingProject.name,
        description: description ?? existingProject.description ?? "",
        categoryId:
          categoryId !== undefined
            ? (categoryId ?? "")
            : (existingProject.categoryId ?? ""),
        status: normalizedStatus ?? normalizeCompanyStatus(existingProject.status),
        startDate:
          startDate !== undefined
            ? (startDate ?? null)
            : (existingProject.startDate ? existingProject.startDate.toISOString() : null),
        endDate:
          endDate !== undefined
            ? (endDate ?? null)
            : (existingProject.endDate ? existingProject.endDate.toISOString() : null),
      });

      const merged = mergeProjectCustomDataPreservingUnknown(
        existingProject.customData,
        normalizedCustomData,
        fields
      );
      mergedCustomData = merged as Prisma.InputJsonValue;
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status: normalizedStatus }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(categoryId !== undefined && {
          category: categoryId ? { connect: { id: categoryId } } : { disconnect: true },
        }),
        ...(mergedCustomData !== undefined && {
          customData: mergedCustomData,
        }),
      },
      include: {
        category: true,
        members: {
          include: {
            user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
          },
        },
        tasks: {
          select: { status: true },
        },
        _count: { select: { phases: true, tasks: true } },
      },
    });

    return NextResponse.json({
      ...project,
      status: normalizeCompanyStatus(project.status),
    });
  } catch (error) {
    console.error("[PUT /api/projects/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, id, {
      managerOnly: true,
    });
    if (!projectAccess.ok) return projectAccess.response;

    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/projects/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
