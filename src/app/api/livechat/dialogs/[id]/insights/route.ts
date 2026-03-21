import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { parseMessagePayload } from "@/lib/chat-message";
import { canAccessLiveChatDialog } from "@/lib/livechat-access";
import { loadLiveChatSettings } from "@/lib/livechat-settings";
import { generateLiveChatInsights } from "@/lib/ai/livechat-insights";
import { isVisitorProxyLogin } from "@/lib/livechat-widget-auth";

function displayName(user: { name: string; fullname: string; surname: string }) {
  return user.fullname || [user.name, user.surname].filter(Boolean).join(" ").trim() || "Unknown";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("livechat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const [settings, dialog] = await Promise.all([
      loadLiveChatSettings(),
      prisma.chatDialog.findUnique({
        where: { id },
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
          messages: {
            orderBy: { createdAt: "asc" },
            take: 250,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  fullname: true,
                  surname: true,
                  login: true,
                },
              },
            },
          },
        },
      }),
    ]);

    if (!settings.aiInsightsEnabled) {
      return NextResponse.json(
        { error: "AI insights are disabled in livechat settings." },
        { status: 403 }
      );
    }

    if (!dialog || !dialog.isExternal) {
      return NextResponse.json({ error: "Live chat dialog not found" }, { status: 404 });
    }

    const memberIds = dialog.members.map((member) => member.userId);
    if (!canAccessLiveChatDialog(accessResult.ctx.access, accessResult.ctx.userId, memberIds)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const transcript = dialog.messages.map((message) => {
      const parsed = parseMessagePayload(message.content);
      const role = isVisitorProxyLogin(message.user.login)
        ? "visitor"
        : message.isSystem
        ? "system"
        : "agent";

      return {
        role,
        author: role === "visitor" ? dialog.visitorName?.trim() || "Visitor" : displayName(message.user),
        text: parsed.payload.text || "",
        createdAt: message.createdAt.toISOString(),
      } as const;
    });

    const insight = await generateLiveChatInsights({
      dialog: {
        id: dialog.id,
        subject: dialog.subject?.trim() || dialog.visitorName?.trim() || "Live chat session",
        visitorName: dialog.visitorName,
        visitorEmail: dialog.visitorEmail,
        status: dialog.status,
        assignedTo: dialog.members.map((member) => displayName(member.user)),
      },
      totals: {
        messages: dialog.messages.length,
        attachments: dialog.messages.reduce((acc, message) => {
          const parsed = parseMessagePayload(message.content);
          return acc + parsed.payload.attachments.length;
        }, 0),
      },
      transcript,
    });

    return NextResponse.json({
      ...insight,
      messageCount: dialog.messages.length,
      generatedFor: {
        dialogId: dialog.id,
        status: dialog.status,
      },
    });
  } catch (error) {
    console.error("[GET /api/livechat/dialogs/[id]/insights]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
