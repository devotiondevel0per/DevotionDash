import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const task = await prisma.task.findUnique({ where: { id }, select: { id: true } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const comments = await prisma.taskComment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, fullname: true } },
      },
    });

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
    const { content } = body as { content: string };

    if (!content || typeof content !== "string" || content.trim() === "") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const comment = await prisma.taskComment.create({
      data: {
        taskId: id,
        userId: accessResult.ctx.userId,
        content: content.trim(),
      },
      include: {
        user: { select: { id: true, name: true, fullname: true } },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("[POST /api/tasks/[id]/comments]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
