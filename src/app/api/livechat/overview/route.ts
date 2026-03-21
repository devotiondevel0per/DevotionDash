import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { buildLiveChatVisibilityWhere } from "@/lib/livechat-access";
import { isVisitorProxyLogin } from "@/lib/livechat-widget-auth";

export async function GET() {
  const accessResult = await requireModuleAccess("livechat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const visibilityWhere = buildLiveChatVisibilityWhere(
      accessResult.ctx.access,
      accessResult.ctx.userId
    );
    const baseWhere = {
      ...visibilityWhere,
      isExternal: true,
    };
    const lookbackStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [
      openDialogs,
      closedToday,
      unassignedOpen,
      messagesToday,
      activeGroups,
      openDialogLastMessages,
      firstResponseSamples,
    ] = await Promise.all([
      prisma.chatDialog.count({ where: { ...baseWhere, status: "open" } }),
      prisma.chatDialog.count({ where: { ...baseWhere, status: "closed", updatedAt: { gte: startOfDay } } }),
      prisma.chatDialog.count({
        where: {
          ...baseWhere,
          status: "open",
          members: { none: {} },
        },
      }),
      prisma.chatMessage.count({
        where: {
          dialog: {
            ...baseWhere,
          },
          createdAt: { gte: startOfDay },
        },
      }),
      prisma.chatServiceGroup.count({ where: { isActive: true } }),
      prisma.chatDialog.findMany({
        where: { ...baseWhere, status: "open" },
        orderBy: { updatedAt: "desc" },
        take: 400,
        select: {
          id: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              createdAt: true,
              user: { select: { login: true } },
            },
          },
        },
      }),
      prisma.chatDialog.findMany({
        where: {
          ...baseWhere,
          createdAt: { gte: lookbackStart },
        },
        orderBy: { createdAt: "desc" },
        take: 400,
        select: {
          id: true,
          messages: {
            orderBy: { createdAt: "asc" },
            take: 14,
            select: {
              createdAt: true,
              user: { select: { login: true } },
            },
          },
        },
      }),
    ]);

    const awaitingAgentReplies = openDialogLastMessages.reduce((count, dialog) => {
      const latest = dialog.messages[0];
      if (latest && isVisitorProxyLogin(latest.user.login)) {
        return count + 1;
      }
      return count;
    }, 0);

    let firstResponseSumMs = 0;
    let firstResponseSamplesCount = 0;
    for (const dialog of firstResponseSamples) {
      const messages = dialog.messages;
      if (messages.length < 2) continue;
      const firstVisitor = messages.find((message) => isVisitorProxyLogin(message.user.login));
      if (!firstVisitor) continue;
      const firstAgent = messages.find(
        (message) =>
          !isVisitorProxyLogin(message.user.login) &&
          message.createdAt.getTime() > firstVisitor.createdAt.getTime()
      );
      if (!firstAgent) continue;
      firstResponseSumMs += firstAgent.createdAt.getTime() - firstVisitor.createdAt.getTime();
      firstResponseSamplesCount += 1;
    }
    const avgFirstResponseMinutes =
      firstResponseSamplesCount > 0
        ? Math.max(0, Math.round(firstResponseSumMs / firstResponseSamplesCount / 60000))
        : 0;

    const activeDialogs = await prisma.chatDialog.findMany({
      where: { ...baseWhere, status: "open" },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        subject: true,
        visitorName: true,
        visitorEmail: true,
        updatedAt: true,
        members: {
          select: {
            user: {
              select: {
                id: true,
                fullname: true,
                name: true,
                surname: true,
              },
            },
          },
          take: 2,
        },
      },
    });

    return NextResponse.json({
      totals: {
        openDialogs,
        unassignedDialogs: unassignedOpen,
        closedToday,
        messagesToday,
        activeQueues: activeGroups,
        awaitingAgentReplies,
        avgFirstResponseMinutes,
      },
      activeDialogs: activeDialogs.map((dialog) => ({
        id: dialog.id,
        subject: dialog.subject?.trim() || dialog.visitorName?.trim() || "Live chat session",
        visitor: dialog.visitorName?.trim() || dialog.visitorEmail?.trim() || "Unknown visitor",
        assignedTo: dialog.members
          .map((member) => {
            const user = member.user;
            return user.fullname || [user.name, user.surname].filter(Boolean).join(" ").trim();
          })
          .filter(Boolean),
        updatedAt: dialog.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[GET /api/livechat/overview]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
