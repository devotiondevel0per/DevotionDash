import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createMessagePayload,
  parseMessagePayload,
  serializeMessagePayload,
} from "@/lib/chat-message";
import { validateWidgetAccess } from "@/lib/livechat-widget-access";
import {
  ensureVisitorProxyUserId,
  isVisitorProxyLogin,
  verifyWidgetSessionToken,
} from "@/lib/livechat-widget-auth";

type MessageAttachment = {
  id?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  dataUrl?: string;
  kind?: "image" | "video" | "audio" | "file";
};

type Body = {
  token?: string;
  sessionToken?: string;
  siteHost?: string;
  hostGrant?: string;
  content?: string;
  attachments?: MessageAttachment[];
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dialogId: string }> }
) {
  try {
    const { dialogId } = await params;
    const token = req.nextUrl.searchParams.get("token");
    const sessionToken = req.nextUrl.searchParams.get("sessionToken");
    const siteHost = req.nextUrl.searchParams.get("site");
    const hostGrant = req.nextUrl.searchParams.get("grant");

    const access = await validateWidgetAccess(req, token, siteHost, hostGrant);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    if (!verifyWidgetSessionToken(dialogId, sessionToken)) {
      return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
    }

    const sinceRaw = req.nextUrl.searchParams.get("since");
    const sinceDate = sinceRaw ? new Date(sinceRaw) : null;
    const hasSince = Boolean(sinceDate && !Number.isNaN(sinceDate.getTime()));
    const limitRaw = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "120", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 120;

    const dialog = await prisma.chatDialog.findUnique({
      where: { id: dialogId },
      select: {
        id: true,
        isExternal: true,
        visitorName: true,
      },
    });
    if (!dialog || !dialog.isExternal) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        dialogId,
        ...(hasSince && sinceDate ? { createdAt: { gt: sinceDate } } : {}),
      },
      include: {
        user: { select: { id: true, name: true, fullname: true, surname: true, login: true } },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    const items = messages.map((message) => {
      const parsed = parseMessagePayload(message.content);
      const senderType = isVisitorProxyLogin(message.user.login)
        ? "visitor"
        : message.isSystem
        ? "system"
        : "agent";
      const senderName =
        senderType === "visitor"
          ? dialog.visitorName?.trim() || "You"
          : message.user.fullname ||
            [message.user.name, message.user.surname].filter(Boolean).join(" ").trim() ||
            "Agent";

      return {
        id: message.id,
        senderType,
        senderName,
        isSystem: message.isSystem,
        createdAt: message.createdAt.toISOString(),
        payload: parsed.payload,
      };
    });

    return NextResponse.json({
      status: "ok",
      items,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[GET /api/public/livechat/session/[dialogId]/messages]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dialogId: string }> }
) {
  try {
    const { dialogId } = await params;
    const body = (await req.json()) as Body;
    const token = body.token?.trim() || req.nextUrl.searchParams.get("token");
    const sessionToken = body.sessionToken?.trim() || req.nextUrl.searchParams.get("sessionToken");
    const siteHost = body.siteHost?.trim() || req.nextUrl.searchParams.get("site");
    const hostGrant = body.hostGrant?.trim() || req.nextUrl.searchParams.get("grant");
    const content = body.content?.trim() || "";
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    const access = await validateWidgetAccess(req, token, siteHost, hostGrant);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    if (!verifyWidgetSessionToken(dialogId, sessionToken)) {
      return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
    }

    if (!content && attachments.length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const [dialog, visitorUserId] = await Promise.all([
      prisma.chatDialog.findUnique({
        where: { id: dialogId },
        include: {
          members: { select: { userId: true } },
        },
      }),
      ensureVisitorProxyUserId(),
    ]);

    if (!dialog || !dialog.isExternal) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    if (dialog.status === "closed") {
      return NextResponse.json({ error: "This chat is closed" }, { status: 400 });
    }

    const payload = createMessagePayload({
      text: content,
      attachments,
      seenByUserIds: [visitorUserId, ...dialog.members.map((member) => member.userId)],
    });

    const message = await prisma.$transaction(async (tx) => {
      const row = await tx.chatMessage.create({
        data: {
          dialogId,
          userId: visitorUserId,
          content: serializeMessagePayload(payload),
        },
        include: {
          user: { select: { id: true, name: true, fullname: true, surname: true, login: true } },
        },
      });
      await tx.chatDialog.update({
        where: { id: dialogId },
        data: { updatedAt: new Date() },
      });
      return row;
    });

    if (dialog.members.length > 0) {
      await prisma.notification.createMany({
        data: dialog.members.map((member) => ({
          userId: member.userId,
          type: "livechat",
          title: "New visitor reply",
          body: `${dialog.visitorName?.trim() || dialog.visitorEmail?.trim() || "Visitor"}: ${content.slice(0, 180)}`,
          link: `/livechat?dialog=${dialogId}`,
          isRead: false,
        })),
      });
    }

    return NextResponse.json(
      {
        id: message.id,
        senderType: "visitor",
        senderName: dialog.visitorName?.trim() || "You",
        isSystem: false,
        createdAt: message.createdAt.toISOString(),
        payload,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/public/livechat/session/[dialogId]/messages]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
