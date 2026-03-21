import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  createMessagePayload,
  ensureSeenBy,
  parseMessagePayload,
  serializeMessagePayload,
} from "@/lib/chat-message";
import { canAccessLiveChatDialog, canManageLiveChat } from "@/lib/livechat-access";

type MessageInputAttachment = {
  id?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  dataUrl?: string;
  kind?: "image" | "video" | "audio" | "file";
  durationSec?: number;
};

type MessageInputBody = {
  content?: string;
  attachments?: MessageInputAttachment[];
  replyTo?: { id: string; text: string; senderName?: string } | null;
};

function displayName(user: { name: string; fullname: string; surname: string }) {
  return user.fullname || [user.name, user.surname].filter(Boolean).join(" ").trim() || "Unknown";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("livechat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: dialogId } = await params;
    const { searchParams } = new URL(req.url);
    const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "80", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 10), 300) : 80;
    const beforeRaw = searchParams.get("before");
    const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
    const hasValidBefore = Boolean(beforeDate && !Number.isNaN(beforeDate.getTime()));

    const dialog = await prisma.chatDialog.findUnique({
      where: { id: dialogId },
      select: {
        id: true,
        isExternal: true,
        members: { select: { userId: true } },
      },
    });
    if (!dialog || !dialog.isExternal) {
      return NextResponse.json({ error: "Live chat dialog not found" }, { status: 404 });
    }

    const memberIds = dialog.members.map((member) => member.userId);
    if (!canAccessLiveChatDialog(accessResult.ctx.access, accessResult.ctx.userId, memberIds)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await prisma.chatMessage.findMany({
      where: {
        dialogId,
        ...(hasValidBefore && beforeDate ? { createdAt: { lt: beforeDate } } : {}),
      },
      include: {
        user: { select: { id: true, name: true, fullname: true, surname: true, lastActivity: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const orderedRows = [...trimmed].reverse();

    const patchedSeenUpdates: Array<{ id: string; content: string }> = [];
    const items = orderedRows.map((message) => {
      const parsed = parseMessagePayload(message.content);
      if (message.userId !== accessResult.ctx.userId) {
        const seen = ensureSeenBy(parsed.payload, accessResult.ctx.userId);
        if (seen.changed) {
          patchedSeenUpdates.push({
            id: message.id,
            content: serializeMessagePayload(seen.payload),
          });
          return {
            ...message,
            payload: seen.payload,
          };
        }
      }

      return {
        ...message,
        payload: parsed.payload,
      };
    });

    if (patchedSeenUpdates.length > 0) {
      await prisma.$transaction(
        patchedSeenUpdates.map((row) =>
          prisma.chatMessage.update({
            where: { id: row.id },
            data: { content: row.content },
          })
        )
      );
    }

    return NextResponse.json({
      items: items.map((message) => ({
        id: message.id,
        userId: message.userId,
        user: {
          id: message.user.id,
          name: displayName(message.user),
          lastActivity: message.user.lastActivity?.toISOString() ?? null,
        },
        isSystem: message.isSystem,
        createdAt: message.createdAt.toISOString(),
        payload: message.payload,
      })),
      hasMore,
    });
  } catch (error) {
    console.error("[GET /api/livechat/dialogs/[id]/messages]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("livechat", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: dialogId } = await params;
    const body = (await req.json()) as MessageInputBody;
    const content = typeof body.content === "string" ? body.content : "";
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const replyTo = body.replyTo ?? undefined;

    const payload = createMessagePayload({
      text: content,
      attachments,
      replyTo: replyTo || undefined,
      seenByUserIds: [accessResult.ctx.userId],
    });

    if (!payload.text.trim() && payload.attachments.length === 0) {
      return NextResponse.json({ error: "Message text or attachment is required" }, { status: 400 });
    }

    const dialog = await prisma.chatDialog.findUnique({
      where: { id: dialogId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, fullname: true, surname: true },
            },
          },
        },
      },
    });

    if (!dialog || !dialog.isExternal) {
      return NextResponse.json({ error: "Live chat dialog not found" }, { status: 404 });
    }

    const canManage = canManageLiveChat(accessResult.ctx.access);
    const assignedIds = dialog.members.map((member) => member.userId);
    const actorAssigned = assignedIds.includes(accessResult.ctx.userId);
    if (!canManage && !actorAssigned) {
      return NextResponse.json(
        { error: "Only assigned agent can send messages for this chat" },
        { status: 403 }
      );
    }

    const [message] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          dialogId,
          userId: accessResult.ctx.userId,
          content: serializeMessagePayload(payload),
        },
        include: {
          user: {
            select: { id: true, name: true, fullname: true, surname: true, lastActivity: true },
          },
        },
      }),
      prisma.chatDialog.update({
        where: { id: dialogId },
        data: { updatedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: accessResult.ctx.userId },
        data: { lastActivity: new Date() },
      }),
    ]);

    const senderName = displayName(message.user);
    const preview =
      payload.text.trim() || (payload.attachments.length > 0 ? "sent an attachment" : "sent a message");
    const recipientIds = assignedIds.filter((id) => id !== accessResult.ctx.userId);
    if (recipientIds.length > 0) {
      await prisma.notification.createMany({
        data: recipientIds.map((userId) => ({
          userId,
          type: "livechat",
          title: `New live chat message: ${dialog.subject?.trim() || dialog.visitorName?.trim() || "Conversation"}`,
          body: `${senderName}: ${preview.slice(0, 180)}`,
          link: `/livechat?dialog=${dialogId}`,
          isRead: false,
        })),
      });
    }

    return NextResponse.json(
      {
        id: message.id,
        userId: message.userId,
        user: {
          id: message.user.id,
          name: senderName,
          lastActivity: message.user.lastActivity?.toISOString() ?? null,
        },
        isSystem: message.isSystem,
        createdAt: message.createdAt.toISOString(),
        payload,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/livechat/dialogs/[id]/messages]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

