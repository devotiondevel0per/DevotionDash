import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

type RouteContext = { params: Promise<{ id: string }> };

function isMissingTaskCommentColumn(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    const meta = (error.meta ?? {}) as Record<string, unknown>;
    const column = String(meta.column ?? meta.field_name ?? "");
    if (column.toLowerCase().includes("taskcommentid")) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /taskcommentid/i.test(message) && /(unknown column|doesn't exist|p2022|not found)/i.test(message);
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const task = await prisma.task.findUnique({ where: { id }, select: { id: true } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    let comments: Array<Record<string, unknown>> = [];
    try {
      comments = await prisma.taskComment.findMany({
        where: { taskId: id },
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true, fullname: true } },
          attachments: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              fileSize: true,
              mimeType: true,
              createdAt: true,
            },
          },
        },
      });
    } catch (error) {
      if (!isMissingTaskCommentColumn(error)) throw error;
      comments = await prisma.taskComment.findMany({
        where: { taskId: id },
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true, fullname: true } },
        },
      });
      comments = comments.map((comment) => ({ ...comment, attachments: [] }));
    }

    return NextResponse.json(comments);
  } catch (error) {
    console.error("[GET /api/tasks/[id]/comments]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const task = await prisma.task.findUnique({ where: { id }, select: { id: true } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = await req.json();
    const { content, allowEmpty } = body as { content?: string; allowEmpty?: boolean };
    const normalizedContent = typeof content === "string" ? content.trim() : "";
    if (!normalizedContent && !allowEmpty) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    let comment: Record<string, unknown>;
    try {
      comment = await prisma.taskComment.create({
        data: {
          taskId: id,
          userId: accessResult.ctx.userId,
          content: normalizedContent,
        },
        include: {
          user: { select: { id: true, name: true, fullname: true } },
          attachments: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              fileSize: true,
              mimeType: true,
              createdAt: true,
            },
          },
        },
      });
    } catch (error) {
      if (!isMissingTaskCommentColumn(error)) throw error;
      const legacyComment = await prisma.taskComment.create({
        data: {
          taskId: id,
          userId: accessResult.ctx.userId,
          content: normalizedContent,
        },
        include: {
          user: { select: { id: true, name: true, fullname: true } },
        },
      });
      comment = { ...legacyComment, attachments: [] };
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("[POST /api/tasks/[id]/comments]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
