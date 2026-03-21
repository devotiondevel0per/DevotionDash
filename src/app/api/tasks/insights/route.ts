import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { generateTaskInsights } from "@/lib/ai/tasks-insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const nextThreeDays = new Date(todayStart);
    nextThreeDays.setDate(nextThreeDays.getDate() + 3);

    const taskScope = {
      OR: [{ creatorId: userId }, { assignees: { some: { userId } } }],
    };

    const [
      opened,
      completed,
      closed,
      overdue,
      dueToday,
      dueSoon,
      highPriorityOpen,
      focusTasksRaw,
    ] = await Promise.all([
      prisma.task.count({ where: { ...taskScope, status: "opened" } }),
      prisma.task.count({ where: { ...taskScope, status: "completed" } }),
      prisma.task.count({ where: { ...taskScope, status: "closed" } }),
      prisma.task.count({
        where: { ...taskScope, status: "opened", dueDate: { lt: todayStart } },
      }),
      prisma.task.count({
        where: {
          ...taskScope,
          status: "opened",
          dueDate: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      prisma.task.count({
        where: {
          ...taskScope,
          status: "opened",
          dueDate: { gte: todayStart, lte: nextThreeDays },
        },
      }),
      prisma.task.count({
        where: { ...taskScope, status: "opened", priority: "high" },
      }),
      prisma.task.findMany({
        where: {
          ...taskScope,
          status: "opened",
        },
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "asc" }],
        take: 8,
        select: {
          id: true,
          title: true,
          priority: true,
          status: true,
          dueDate: true,
          createdAt: true,
        },
      }),
    ]);

    const focusTasks = focusTasksRaw.map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      openHours: Math.max(
        0,
        Math.round((now.getTime() - task.createdAt.getTime()) / (1000 * 60 * 60))
      ),
    }));

    const insights = await generateTaskInsights({
      totals: {
        opened,
        completed,
        closed,
        overdue,
        dueToday,
        dueSoon,
        highPriorityOpen,
      },
      focusTasks,
    });

    return NextResponse.json(insights);
  } catch (error) {
    console.error("[GET /api/tasks/insights]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
