import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectReadAccess } from "@/lib/project-access";
import {
  canCurrentUserViewProjectTask,
  isMissingProjectTaskCommentParentColumn,
  loadProjectTaskCommentAccessInfo,
} from "@/lib/project-task-access";
import {
  getTaskConversationAuthorEditWindowMinutes,
  isWithinAuthorConversationWindow,
} from "@/lib/task-conversation-policy";

type RouteContext = { params: Promise<{ id: string; taskId: string; commentId: string }> };

function commentSelect(includeParent: boolean) {
  return {
    id: true,
    projectTaskId: true,
    userId: true,
    content: true,
    createdAt: true,
    ...(includeParent ? { parentCommentId: true } : {}),
    user: { select: { id: true, name: true, fullname: true } },
  };
}

async function ensureCommentMutationAllowed(
  accessResult: Awaited<ReturnType<typeof requireModuleAccess>>,
  projectId: string,
  taskId: string,
  commentId: string,
  actionLabel: "edit" | "delete"
) {
  if (!accessResult.ok) return accessResult.response;

  const projectAccess = await requireProjectReadAccess(accessResult.ctx, projectId);
  if (!projectAccess.ok) return projectAccess.response;

  const existing = await prisma.projectTaskComment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      projectTaskId: true,
      userId: true,
      createdAt: true,
      projectTask: { select: { projectId: true } },
    },
  });

  if (
    !existing ||
    existing.projectTaskId !== taskId ||
    existing.projectTask.projectId !== projectId
  ) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  const taskAccess = await loadProjectTaskCommentAccessInfo(prisma, taskId);
  if (!taskAccess) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (
    !canCurrentUserViewProjectTask(
      { assigneeId: taskAccess.assigneeId, assignees: taskAccess.assignees },
      accessResult.ctx.userId,
      accessResult.ctx.access,
      projectAccess.scope
    )
  ) {
    return NextResponse.json({ error: "Forbidden: task access denied" }, { status: 403 });
  }

  const canManageConversation =
    accessResult.ctx.access.isAdmin ||
    accessResult.ctx.access.permissions.projects.manage ||
    projectAccess.scope.isManager;

  if (canManageConversation) {
    return { existing };
  }

  const isCommentAuthor = existing.userId === accessResult.ctx.userId;
  if (!isCommentAuthor) {
    return NextResponse.json(
      { error: `You can ${actionLabel} only your own conversation` },
      { status: 403 }
    );
  }

  const windowMinutes = await getTaskConversationAuthorEditWindowMinutes();
  const withinWindow = isWithinAuthorConversationWindow(existing.createdAt, windowMinutes);
  if (!withinWindow) {
    return NextResponse.json(
      {
        error: `You can ${actionLabel} your conversation only within ${windowMinutes} minute(s) of posting`,
      },
      { status: 403 }
    );
  }

  return { existing };
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("projects", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId, taskId, commentId } = await params;
    const body = await req.json();
    const { content } = body as { content?: string };

    if (!content || typeof content !== "string" || content.trim() === "") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const accessCheck = await ensureCommentMutationAllowed(
      accessResult,
      projectId,
      taskId,
      commentId,
      "edit"
    );
    if (accessCheck instanceof NextResponse) {
      return accessCheck;
    }

    let updated: Record<string, unknown> | null = null;
    try {
      updated = await prisma.projectTaskComment.update({
        where: { id: commentId },
        data: { content: content.trim() },
        select: commentSelect(true),
      });
    } catch (error) {
      if (!isMissingProjectTaskCommentParentColumn(error)) throw error;
      updated = await prisma.projectTaskComment.update({
        where: { id: commentId },
        data: { content: content.trim() },
        select: commentSelect(false),
      });
      updated = { ...updated, parentCommentId: null };
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PUT /api/projects/[id]/tasks/[taskId]/comments/[commentId]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return PUT(req, ctx);
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("projects", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId, taskId, commentId } = await params;
    const accessCheck = await ensureCommentMutationAllowed(
      accessResult,
      projectId,
      taskId,
      commentId,
      "delete"
    );
    if (accessCheck instanceof NextResponse) {
      return accessCheck;
    }

    await prisma.projectTaskComment.delete({ where: { id: commentId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/projects/[id]/tasks/[taskId]/comments/[commentId]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
