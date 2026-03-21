import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMessagePayload, serializeMessagePayload } from "@/lib/chat-message";
import { validateWidgetAccess } from "@/lib/livechat-widget-access";
import {
  buildWidgetSessionToken,
  ensureVisitorProxyUserId,
} from "@/lib/livechat-widget-auth";
import {
  LIVECHAT_LAST_ASSIGNED_AGENT_KEY,
  loadLiveChatSettings,
} from "@/lib/livechat-settings";
import { listEligibleLiveChatAgents, pickLiveChatAgent } from "@/lib/livechat-routing";

type Body = {
  token?: string;
  siteHost?: string;
  hostGrant?: string;
  visitorName?: string;
  visitorEmail?: string;
  subject?: string;
  firstMessage?: string;
  groupId?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const token = body.token?.trim() || req.nextUrl.searchParams.get("token");
    const siteHost = body.siteHost?.trim() || req.nextUrl.searchParams.get("site");
    const hostGrant = body.hostGrant?.trim() || req.nextUrl.searchParams.get("grant");
    const access = await validateWidgetAccess(req, token, siteHost, hostGrant);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const visitorName = body.visitorName?.trim() || null;
    const visitorEmail = body.visitorEmail?.trim() || null;
    const subject = body.subject?.trim() || null;
    const firstMessage = body.firstMessage?.trim() || "";
    const groupId = body.groupId?.trim() || null;

    if (!visitorName && !visitorEmail && !subject) {
      return NextResponse.json(
        { error: "Provide at least visitor name, visitor email, or subject." },
        { status: 400 }
      );
    }
    if (!firstMessage) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
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

    const [settings, visitorUserId] = await Promise.all([
      loadLiveChatSettings(),
      ensureVisitorProxyUserId(),
    ]);

    const autoAssignAgent = settings.autoAssignEnabled
      ? pickLiveChatAgent(
          settings.routingStrategy,
          await listEligibleLiveChatAgents(settings.maxOpenPerAgent),
          settings.lastAssignedAgentId
        )
      : null;

    const dialog = await prisma.$transaction(async (tx) => {
      const created = await tx.chatDialog.create({
        data: {
          subject,
          visitorName,
          visitorEmail,
          status: "open",
          isExternal: true,
          groupId,
          members: autoAssignAgent
            ? {
                create: [{ userId: autoAssignAgent.id }],
              }
            : undefined,
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  fullname: true,
                  surname: true,
                },
              },
            },
          },
        },
      });

      const payload = createMessagePayload({
        text: firstMessage,
        type: "text",
        seenByUserIds: autoAssignAgent ? [visitorUserId, autoAssignAgent.id] : [visitorUserId],
      });
      await tx.chatMessage.create({
        data: {
          dialogId: created.id,
          userId: visitorUserId,
          content: serializeMessagePayload(payload),
        },
      });

      if (settings.routingStrategy === "round_robin" && autoAssignAgent) {
        await tx.systemSetting.upsert({
          where: { key: LIVECHAT_LAST_ASSIGNED_AGENT_KEY },
          create: { key: LIVECHAT_LAST_ASSIGNED_AGENT_KEY, value: autoAssignAgent.id },
          update: { value: autoAssignAgent.id },
        });
      }

      return created;
    });

    if (autoAssignAgent) {
      await prisma.notification.create({
        data: {
          userId: autoAssignAgent.id,
          type: "livechat",
          title: "New website live chat",
          body: `${visitorName || visitorEmail || "Visitor"} started a chat.`,
          link: `/livechat?dialog=${dialog.id}`,
          isRead: false,
        },
      });
    }

    const sessionToken = buildWidgetSessionToken(dialog.id);
    return NextResponse.json(
      {
        dialogId: dialog.id,
        sessionToken,
        status: dialog.status,
        assignedTo: dialog.members.map((member) => ({
          id: member.user.id,
          name:
            member.user.fullname ||
            [member.user.name, member.user.surname].filter(Boolean).join(" ").trim() ||
            "Agent",
        })),
        createdAt: dialog.createdAt.toISOString(),
        subject: dialog.subject?.trim() || dialog.visitorName?.trim() || "Live chat session",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/public/livechat/session]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
