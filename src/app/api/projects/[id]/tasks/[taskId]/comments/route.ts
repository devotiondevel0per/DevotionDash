import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectReadAccess } from "@/lib/project-access";
import {
  canCurrentUserCommentOnProjectTask,
  isMissingProjectTaskCommentParentColumn,
  loadProjectTaskCommentAccessInfo,
} from "@/lib/project-task-access";

type RouteContext = { params: Promise<{ id: string; taskId: string }> };

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

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("projects", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId, taskId } = await params;
    const projectAccess = await requireProjectReadAccess(accessResult.ctx, projectId);
    if (!projectAccess.ok) return projectAccess.response;

    const task = await prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    let comments: Array<Record<string, unknown>> = [];
    try {
      comments = await prisma.projectTaskComment.findMany({
        where: { projectTaskId: taskId },
        orderBy: { createdAt: "asc" },
        select: commentSelect(true),
      });
    } catch (error) {
      if (!isMissingProjectTaskCommentParentColumn(error)) throw error;
      comments = await prisma.projectTaskComment.findMany({
        where: { projectTaskId: taskId },
        orderBy: { createdAt: "asc" },
        select: commentSelect(false),
      });
      comments = comments.map((entry) => ({ ...entry, parentCommentId: null }));
    }

    return NextResponse.json(comments);
  } catch (error) {
    console.error("[GET /api/projects/[id]/tasks/[taskId]/comments]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("projects", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId, taskId } = await params;
    const projectAccess = await requireProjectReadAccess(accessResult.ctx, projectId);
    if (!projectAccess.ok) return projectAccess.response;

    const scopedTask = await prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!scopedTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const taskAccess = await loadProjectTaskCommentAccessInfo(prisma, taskId);
    if (!taskAccess) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const canComment = canCurrentUserCommentOnProjectTask(
      taskAccess,
      accessResult.ctx.userId,
      accessResult.ctx.access
    );
    if (!canComment) {
      return NextResponse.json(
        { error: "You can view this task, but commenting is disabled for this assignment" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { content, parentCommentId } = body as {
      content?: string;
      parentCommentId?: string | null;
    };

    const normalizedContent = typeof content === "string" ? content.trim() : "";
    if (!normalizedContent) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const normalizedParentCommentId = typeof parentCommentId === "string" && parentCommentId.trim()
      ? parentCommentId.trim()
      : null;

    if (normalizedParentCommentId) {
      const parent = await prisma.projectTaskComment.findUnique({
        where: { id: normalizedParentCommentId },
        select: { id: true, projectTaskId: true },
      });
      if (!parent || parent.projectTaskId !== taskId) {
        return NextResponse.json({ error: "Reply target comment not found" }, { status: 400 });
      }
    }

    let comment: Record<string, unknown> | null = null;
    try {
      comment = await prisma.projectTaskComment.create({
        data: {
          projectTaskId: taskId,
          userId: accessResult.ctx.userId,
          content: normalizedContent,
          ...(normalizedParentCommentId ? { parentCommentId: normalizedParentCommentId } : {}),
        },
        select: commentSelect(true),
      });
    } catch (error) {
      if (!isMissingProjectTaskCommentParentColumn(error)) throw error;
      comment = await prisma.projectTaskComment.create({
        data: {
          projectTaskId: taskId,
          userId: accessResult.ctx.userId,
          content: normalizedContent,
        },
        select: commentSelect(false),
      });
      comment = { ...comment, parentCommentId: null };
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projects/[id]/tasks/[taskId]/comments]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
