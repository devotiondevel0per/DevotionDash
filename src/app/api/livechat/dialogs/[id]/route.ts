import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { createMessagePayload, serializeMessagePayload } from "@/lib/chat-message";
import { canAccessLiveChatDialog, canManageLiveChat } from "@/lib/livechat-access";

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
    const { id } = await params;
    const dialog = await prisma.chatDialog.findUnique({
      where: { id },
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
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    if (!dialog || !dialog.isExternal) {
      return NextResponse.json({ error: "Live chat dialog not found" }, { status: 404 });
    }

    const memberIds = dialog.members.map((member) => member.userId);
    if (!canAccessLiveChatDialog(accessResult.ctx.access, accessResult.ctx.userId, memberIds)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("[GET /api/livechat/dialogs/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("livechat", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const body = (await req.json()) as {
      status?: string;
      subject?: string | null;
      groupId?: string | null;
    };

    const existing = await prisma.chatDialog.findUnique({
      where: { id },
      include: { members: { select: { userId: true } } },
    });
    if (!existing || !existing.isExternal) {
      return NextResponse.json({ error: "Live chat dialog not found" }, { status: 404 });
    }

    const canManage = canManageLiveChat(accessResult.ctx.access);
    const memberIds = existing.members.map((member) => member.userId);
    const isMember = memberIds.includes(accessResult.ctx.userId);

    if (!canManage && !isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.subject === "string") {
      data.subject = body.subject.trim() || null;
    }

    if (body.status !== undefined) {
      const nextStatus = body.status === "closed" ? "closed" : "open";
      data.status = nextStatus;
    }

    if (body.groupId !== undefined) {
      if (!canManage) {
        return NextResponse.json({ error: "Only managers can change queue group" }, { status: 403 });
      }
      if (body.groupId === null || body.groupId === "none" || body.groupId === "") {
        data.groupId = null;
      } else {
        const group = await prisma.chatServiceGroup.findUnique({
          where: { id: body.groupId },
          select: { id: true, isActive: true },
        });
        if (!group || !group.isActive) {
          return NextResponse.json({ error: "Invalid queue group" }, { status: 400 });
        }
        data.groupId = group.id;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.chatDialog.update({
        where: { id },
        data,
        include: {
          group: { select: { id: true, name: true } },
          members: {
            include: {
              user: { select: { id: true, name: true, fullname: true, surname: true } },
            },
          },
        },
      });

      if (body.status !== undefined && body.status !== existing.status) {
        const actor = await tx.user.findUnique({
          where: { id: accessResult.ctx.userId },
          select: { id: true, name: true, fullname: true, surname: true },
        });
        const actorName = actor ? displayName(actor) : "System";
        const payload = createMessagePayload({
          type: "system",
          text: `Conversation marked as '${row.status}' by ${actorName}.`,
          seenByUserIds: [accessResult.ctx.userId],
        });
        await tx.chatMessage.create({
          data: {
            dialogId: row.id,
            userId: accessResult.ctx.userId,
            isSystem: true,
            content: serializeMessagePayload(payload),
          },
        });
      }

      return row;
    });

    return NextResponse.json({
      id: updated.id,
      subject: updated.subject,
      status: updated.status,
      group: updated.group,
      assignedTo: updated.members.map((member) => ({
        id: member.user.id,
        name: displayName(member.user),
      })),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("[PUT /api/livechat/dialogs/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
