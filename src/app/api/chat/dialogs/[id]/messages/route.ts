import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  createMessagePayload,
  ensureSeenBy,
  parseMessagePayload,
  serializeMessagePayload,
} from "@/lib/chat-message";
import { isMalformedDirectDialog } from "@/lib/chat-dialogs";

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
  forwardedFrom?: { id: string; senderName?: string } | null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("chat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: dialogId } = await params;
    const { searchParams } = new URL(req.url);
    const beforeRaw = searchParams.get("before");
    const afterRaw = searchParams.get("after");
    const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "40", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 40;
    const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
    const afterDate = afterRaw ? new Date(afterRaw) : null;
    const hasValidBefore = Boolean(beforeDate && !Number.isNaN(beforeDate.getTime()));
    const hasValidAfter = Boolean(afterDate && !Number.isNaN(afterDate.getTime()));

    const dialog = await prisma.chatDialog.findFirst({
      where: { id: dialogId, isExternal: false },
      select: {
        id: true,
        subject: true,
        groupId: true,
        organizationId: true,
        members: { select: { userId: true } },
      },
    });
    if (!dialog) {
      return NextResponse.json({ error: "Dialog not found" }, { status: 404 });
    }
    if (isMalformedDirectDialog(dialog)) {
      return NextResponse.json({ error: "Dialog not found" }, { status: 404 });
    }
    if (
      !accessResult.ctx.access.permissions.chat.manage &&
      !dialog.members.some((member) => member.userId === accessResult.ctx.userId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const createdAtFilter: Record<string, Date> = {};
    if (hasValidBefore && beforeDate) createdAtFilter.lt = beforeDate;
    if (hasValidAfter && afterDate) createdAtFilter.gt = afterDate;

    const where: Record<string, unknown> = { dialogId };
    if (Object.keys(createdAtFilter).length > 0) {
      where.createdAt = createdAtFilter;
    }

    const take = limit + 1;
    const orderBy = hasValidAfter ? { createdAt: "asc" as const } : { createdAt: "desc" as const };

    const messages = await prisma.chatMessage.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, fullname: true, photoUrl: true, lastActivity: true } },
      },
      orderBy,
      take,
    });

    const hasMore = messages.length > limit;
    const trimmed = hasMore ? messages.slice(0, limit) : messages;
    const orderedRows = hasValidAfter ? trimmed : [...trimmed].reverse();

    const patchedSeenUpdates: Array<{ id: string; content: string }> = [];
    const shaped = orderedRows.map((message) => {
      const parsed = parseMessagePayload(message.content);
      if (message.userId !== accessResult.ctx.userId) {
        const { payload, changed } = ensureSeenBy(parsed.payload, accessResult.ctx.userId);
        if (changed) {
          patchedSeenUpdates.push({
            id: message.id,
            content: serializeMessagePayload(payload),
          });
          return {
            ...message,
            payload,
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

    await prisma.user.update({
      where: { id: accessResult.ctx.userId },
      data: { lastActivity: new Date() },
    });

    return NextResponse.json({
      items: shaped,
      hasMore,
    });
  } catch (error) {
    console.error("[GET /api/chat/dialogs/[id]/messages]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("chat", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: dialogId } = await params;
    const body = (await req.json()) as MessageInputBody;

    const content = typeof body.content === "string" ? body.content : "";
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const replyTo = body.replyTo ?? undefined;
    const forwardedFrom = body.forwardedFrom ?? undefined;

    const payload = createMessagePayload({
      text: content,
      attachments,
      replyTo: replyTo || undefined,
      forwardedFrom: forwardedFrom || undefined,
      seenByUserIds: [accessResult.ctx.userId],
    });

    if (!payload.text.trim() && payload.attachments.length === 0) {
      return NextResponse.json({ error: "Message text or attachment is required" }, { status: 400 });
    }

    const dialog = await prisma.chatDialog.findFirst({
      where: { id: dialogId, isExternal: false },
      select: {
        id: true,
        subject: true,
        groupId: true,
        organizationId: true,
        visitorName: true,
        organization: { select: { name: true } },
        members: { select: { userId: true, user: { select: { name: true, fullname: true } } } },
      },
    });
    if (!dialog) {
      return NextResponse.json({ error: "Dialog not found" }, { status: 404 });
    }
    if (isMalformedDirectDialog(dialog)) {
      return NextResponse.json({ error: "Dialog not found" }, { status: 404 });
    }
    if (
      !accessResult.ctx.access.permissions.chat.manage &&
      !dialog.members.some((member) => member.userId === accessResult.ctx.userId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [message] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          dialogId,
          userId: accessResult.ctx.userId,
          content: serializeMessagePayload(payload),
        },
        include: {
          user: { select: { id: true, name: true, fullname: true, photoUrl: true, lastActivity: true } },
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

    const recipientIds = dialog.members
      .map((member) => member.userId)
      .filter((userId) => userId !== accessResult.ctx.userId);

    if (recipientIds.length > 0) {
      const senderName = message.user?.fullname || message.user?.name || "New message";
      const otherMember = dialog.members.find((m) => m.userId !== accessResult.ctx.userId);
      const otherMemberName = otherMember?.user?.fullname || otherMember?.user?.name;
      const titleSource =
        dialog.visitorName ||
        dialog.subject ||
        dialog.organization?.name ||
        otherMemberName ||
        senderName;
      const preview = payload.text.trim() || (payload.attachments.length > 0 ? "sent an attachment" : "sent a message");

      await prisma.notification.createMany({
        data: recipientIds.map((userId) => ({
          userId,
          type: "chat",
          title: `New message in ${titleSource}`,
          body: `${senderName}: ${preview.slice(0, 180)}`,
          link: `/chat?dialog=${dialogId}`,
          isRead: false,
        })),
      });
    }

    return NextResponse.json(
      {
        ...message,
        payload,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/chat/dialogs/[id]/messages]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
