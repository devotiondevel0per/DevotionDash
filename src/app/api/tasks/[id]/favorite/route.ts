import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

type RouteContext = { params: Promise<{ id: string }> };

async function getFavoriteState(taskId: string, userId: string) {
  const [favorite, favoriteCount] = await Promise.all([
    prisma.taskFavorite.findUnique({
      where: {
        taskId_userId: {
          taskId,
          userId,
        },
      },
      select: { id: true },
    }),
    prisma.taskFavorite.count({ where: { taskId } }),
  ]);

  return {
    isFavorite: Boolean(favorite),
    favoriteCount,
  };
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const userId = accessResult.ctx.userId;

    const task = await prisma.task.findUnique({ where: { id }, select: { id: true } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await prisma.taskFavorite.upsert({
      where: {
        taskId_userId: {
          taskId: id,
          userId,
        },
      },
      update: {},
      create: {
        taskId: id,
        userId,
      },
    });

    return NextResponse.json(await getFavoriteState(id, userId));
  } catch (error) {
    console.error("[POST /api/tasks/[id]/favorite]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const userId = accessResult.ctx.userId;

    await prisma.taskFavorite.deleteMany({
      where: {
        taskId: id,
        userId,
      },
    });

    return NextResponse.json(await getFavoriteState(id, userId));
  } catch (error) {
    console.error("[DELETE /api/tasks/[id]/favorite]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
