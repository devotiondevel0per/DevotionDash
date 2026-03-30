import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { parseMessagePayload } from "@/lib/chat-message";
import {
  compareDirectDialogs,
  getCanonicalDialogSubject,
  getDirectDialogKey,
  isMalformedDirectDialog,
  withCanonicalDialogSubject,
} from "@/lib/chat-dialogs";

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("chat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    where.isExternal = false;
    if (groupId) where.groupId = groupId;
    if (status) where.status = status;
    if (search) {
      where.subject = { contains: search };
    }
    // Always filter by membership so each user only sees their own dialogs
    where.members = { some: { userId: accessResult.ctx.userId } };

    const dialogs = await prisma.chatDialog.findMany({
      where,
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
            user: { select: { id: true, name: true, fullname: true } },
          },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const passthrough: typeof dialogs = [];
    const directDialogs = new Map<string, (typeof dialogs)[number]>();

    for (const dialog of dialogs) {
      if (isMalformedDirectDialog(dialog)) {
        continue;
      }
      const key = getDirectDialogKey(dialog);
      if (!key) {
        passthrough.push(dialog);
        continue;
      }

      const existing = directDialogs.get(key);
      if (!existing || compareDirectDialogs(dialog, existing) > 0) {
        directDialogs.set(key, dialog);
      }
    }

    const deduped = [...passthrough, ...directDialogs.values()].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    const dialogIds = deduped.map((dialog) => dialog.id);
    const unreadByDialogId = new Map<string, number>();

    if (dialogIds.length > 0) {
      const unreadRows = await prisma.notification.findMany({
        where: {
          userId: accessResult.ctx.userId,
          type: "chat",
          isRead: false,
          link: {
            in: dialogIds.map((id) => `/chat?dialog=${id}`),
          },
        },
        select: { link: true },
      });

      for (const row of unreadRows) {
        const link = row.link ?? "";
        if (!link.startsWith("/chat?dialog=")) continue;
        const dialogId = link.slice("/chat?dialog=".length);
        if (!dialogId) continue;
        unreadByDialogId.set(dialogId, (unreadByDialogId.get(dialogId) ?? 0) + 1);
      }
    }

    return NextResponse.json(
      deduped.map((dialog) => ({
        ...withCanonicalDialogSubject(dialog),
        unreadCount: unreadByDialogId.get(dialog.id) ?? 0,
        messages: dialog.messages.map((message) => ({
          ...message,
          payload: parseMessagePayload(message.content).payload,
        })),
      }))
    );
  } catch (error) {
    console.error("[GET /api/chat/dialogs]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("chat", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const { subject, groupId, memberIds, organizationId } = body;

    if (!Array.isArray(memberIds)) {
      return NextResponse.json({ error: "memberIds must be an array" }, { status: 400 });
    }

    const currentUserId = String(accessResult.ctx.userId).trim();
    const normalizedMemberIds = memberIds
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter((id): id is string => Boolean(id));

    // Deduplicate memberIds and always include the current user
    const allMemberIds = Array.from(
      new Set([...normalizedMemberIds, currentUserId])
    ) as string[];
    const otherMemberIds = allMemberIds.filter((id) => id !== currentUserId);

    if (allMemberIds.length < 2 || otherMemberIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one other member" },
        { status: 400 }
      );
    }

    const existingUsers = await prisma.user.findMany({
      where: { id: { in: allMemberIds }, isActive: true },
      select: { id: true },
    });
    if (existingUsers.length !== allMemberIds.length) {
      return NextResponse.json(
        { error: "One or more selected members are invalid or inactive" },
        { status: 400 }
      );
    }

    const normalizedSubject = getCanonicalDialogSubject(
      typeof subject === "string" ? subject : null,
      allMemberIds.map((userId) => ({ userId }))
    );

    const include = {
      group: { select: { id: true, name: true } },
      organization: { select: { id: true, name: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
        },
      },
    };

    // For direct messages (exactly 2 members, no group/subject), find-or-create
    const isDM = allMemberIds.length === 2 && !groupId && !normalizedSubject && !organizationId;
    if (isDM) {
      // Fetch candidate DM dialogs that include the current user
      // _count.is is unsupported in Prisma 5/MySQL — filter programmatically
      const candidates = await prisma.chatDialog.findMany({
        where: {
          isExternal: false,
          groupId: null,
          organizationId: null,
          members: { some: { userId: currentUserId } },
        },
        include: {
          ...include,
          members: {
            include: {
              user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      const directKey = [...allMemberIds].sort().join(":");
      const existing = candidates.find((dialog) => getDirectDialogKey(dialog) === directKey);

      if (existing) {
        return NextResponse.json(withCanonicalDialogSubject(existing), { status: 200 });
      }
    }

    const dialog = await prisma.chatDialog.create({
      data: {
        subject: normalizedSubject,
        isExternal: false,
        ...(groupId ? { groupId } : {}),
        ...(organizationId ? { organizationId } : {}),
        members: {
          create: allMemberIds.map((userId: string) => ({ userId })),
        },
      },
      include,
    });

    return NextResponse.json(withCanonicalDialogSubject(dialog), { status: 201 });
  } catch (error) {
    console.error("[POST /api/chat/dialogs]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
