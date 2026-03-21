import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { createMessagePayload, parseMessagePayload, serializeMessagePayload } from "@/lib/chat-message";
import {
  buildLiveChatVisibilityWhere,
  canManageLiveChat,
  canWriteLiveChat,
} from "@/lib/livechat-access";
import {
  LIVECHAT_LAST_ASSIGNED_AGENT_KEY,
  loadLiveChatSettings,
} from "@/lib/livechat-settings";
import { listEligibleLiveChatAgents, pickLiveChatAgent } from "@/lib/livechat-routing";

function displayName(user: { name: string; fullname: string; surname: string }) {
  return user.fullname || [user.name, user.surname].filter(Boolean).join(" ").trim() || "Unknown";
}

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("livechat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim().toLowerCase() ?? "open";
    const queue = searchParams.get("queue")?.trim().toLowerCase() ?? "all";
    const groupId = searchParams.get("groupId")?.trim() ?? "";
    const search = searchParams.get("search")?.trim() ?? "";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "120", 10), 1), 300);

    const visibilityWhere = buildLiveChatVisibilityWhere(
      accessResult.ctx.access,
      accessResult.ctx.userId
    );
    const where: Record<string, unknown> = {
      ...visibilityWhere,
      isExternal: true,
    };

    if (status !== "all") {
      where.status = status === "closed" ? "closed" : "open";
    }
    if (queue === "unassigned") {
      where.members = { none: {} };
    } else if (queue === "assigned") {
      where.members = { some: {} };
    }
    if (groupId) {
      where.groupId = groupId;
    }
    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { visitorName: { contains: search } },
        { visitorEmail: { contains: search } },
      ];
    }

    const dialogs = await prisma.chatDialog.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        group: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                fullname: true,
                surname: true,
                photoUrl: true,
                isActive: true,
                lastActivity: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            user: { select: { id: true, name: true, fullname: true, surname: true } },
          },
        },
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json({
      permissions: {
        canManage: canManageLiveChat(accessResult.ctx.access),
        canWrite: canWriteLiveChat(accessResult.ctx.access),
      },
      items: dialogs.map((dialog) => {
        const last = dialog.messages[0];
        const parsed = last ? parseMessagePayload(last.content) : null;
        return {
          id: dialog.id,
          subject: dialog.subject?.trim() || dialog.visitorName?.trim() || "Live chat session",
          visitorName: dialog.visitorName?.trim() || null,
          visitorEmail: dialog.visitorEmail?.trim() || null,
          status: dialog.status,
          group: dialog.group,
          organization: dialog.organization,
          createdAt: dialog.createdAt.toISOString(),
          updatedAt: dialog.updatedAt.toISOString(),
          messageCount: dialog._count.messages,
          assignedTo: dialog.members.map((member) => ({
            id: member.user.id,
            name: displayName(member.user),
            isActive: member.user.isActive,
            lastActivity: member.user.lastActivity?.toISOString() ?? null,
          })),
          lastMessage: last
            ? {
                id: last.id,
                text: parsed?.payload.text ?? "",
                type: parsed?.payload.type ?? "text",
                sender: displayName(last.user),
                createdAt: last.createdAt.toISOString(),
              }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error("[GET /api/livechat/dialogs]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("livechat", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as {
      subject?: string;
      visitorName?: string;
      visitorEmail?: string;
      groupId?: string | null;
      organizationId?: string | null;
      firstMessage?: string;
      assignToSelf?: boolean;
    };

    const subject = body.subject?.trim() || null;
    const visitorName = body.visitorName?.trim() || null;
    const visitorEmail = body.visitorEmail?.trim() || null;
    const firstMessage = body.firstMessage?.trim() || "";
    const groupId = body.groupId?.trim() || null;
    const organizationId = body.organizationId?.trim() || null;
    const assignToSelf = body.assignToSelf !== false;
    const settings = await loadLiveChatSettings();

    if (!visitorName && !visitorEmail && !subject) {
      return NextResponse.json(
        { error: "Provide at least one of subject, visitorName, or visitorEmail" },
        { status: 400 }
      );
    }

    if (groupId) {
      const group = await prisma.chatServiceGroup.findUnique({
        where: { id: groupId },
        select: { id: true, isActive: true },
      });
      if (!group || !group.isActive) {
        return NextResponse.json({ error: "Invalid queue group" }, { status: 400 });
      }
    }

    if (organizationId) {
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!organization) {
        return NextResponse.json({ error: "Invalid organizationId" }, { status: 400 });
      }
    }

    const autoAssignAgent =
      !assignToSelf && settings.autoAssignEnabled
        ? pickLiveChatAgent(
            settings.routingStrategy,
            await listEligibleLiveChatAgents(settings.maxOpenPerAgent),
            settings.lastAssignedAgentId
          )
        : null;

    const memberUserId = assignToSelf
      ? accessResult.ctx.userId
      : autoAssignAgent?.id ?? null;

    const dialog = await prisma.$transaction(async (tx) => {
      const created = await tx.chatDialog.create({
        data: {
          subject,
          visitorName,
          visitorEmail,
          status: "open",
          isExternal: true,
          groupId,
          organizationId,
          members: memberUserId
            ? {
                create: [{ userId: memberUserId }],
              }
            : undefined,
        },
        include: {
          group: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
          members: {
            include: {
              user: { select: { id: true, name: true, fullname: true, surname: true } },
            },
          },
        },
      });

      if (firstMessage) {
        const payload = createMessagePayload({
          text: firstMessage,
          type: "text",
          seenByUserIds: memberUserId
            ? [accessResult.ctx.userId, memberUserId]
            : [accessResult.ctx.userId],
        });
        await tx.chatMessage.create({
          data: {
            dialogId: created.id,
            userId: accessResult.ctx.userId,
            content: serializeMessagePayload(payload),
          },
        });
      }

      if (settings.routingStrategy === "round_robin" && autoAssignAgent) {
        await tx.systemSetting.upsert({
          where: { key: LIVECHAT_LAST_ASSIGNED_AGENT_KEY },
          create: { key: LIVECHAT_LAST_ASSIGNED_AGENT_KEY, value: autoAssignAgent.id },
          update: { value: autoAssignAgent.id },
        });
      }

      return created;
    });

    if (autoAssignAgent && autoAssignAgent.id !== accessResult.ctx.userId) {
      await prisma.notification.create({
        data: {
          userId: autoAssignAgent.id,
          type: "livechat",
          title: "Auto-assigned live chat",
          body: `A new visitor conversation was routed to you: ${dialog.subject?.trim() || "Live chat session"}`,
          link: `/livechat?dialog=${dialog.id}`,
          isRead: false,
        },
      });
    }

    return NextResponse.json(
      {
        id: dialog.id,
        subject: dialog.subject?.trim() || dialog.visitorName?.trim() || "Live chat session",
        visitorName: dialog.visitorName,
        visitorEmail: dialog.visitorEmail,
        status: dialog.status,
        group: dialog.group,
        organization: dialog.organization,
        assignedTo: dialog.members.map((member) => ({
          id: member.user.id,
          name: displayName(member.user),
        })),
        createdAt: dialog.createdAt.toISOString(),
        updatedAt: dialog.updatedAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/livechat/dialogs]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
