import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { createMessagePayload, serializeMessagePayload } from "@/lib/chat-message";
import { canManageLiveChat } from "@/lib/livechat-access";

function displayName(user: { name: string; fullname: string; surname: string }) {
  return user.fullname || [user.name, user.surname].filter(Boolean).join(" ").trim() || "Unknown";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("livechat", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const body = (await req.json()) as { agentId?: string };
    const requestedAgentId = body.agentId?.trim();
    if (!requestedAgentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const canManage = canManageLiveChat(accessResult.ctx.access);
    if (!canManage && requestedAgentId !== accessResult.ctx.userId) {
      return NextResponse.json({ error: "You can only self-assign" }, { status: 403 });
    }

    const [dialog, targetAgent, actor] = await Promise.all([
      prisma.chatDialog.findUnique({
        where: { id },
        include: { members: { select: { userId: true } } },
      }),
      prisma.user.findUnique({
        where: { id: requestedAgentId },
        select: { id: true, name: true, fullname: true, surname: true, isActive: true },
      }),
      prisma.user.findUnique({
        where: { id: accessResult.ctx.userId },
        select: { id: true, name: true, fullname: true, surname: true },
      }),
    ]);

    if (!dialog || !dialog.isExternal) {
      return NextResponse.json({ error: "Live chat dialog not found" }, { status: 404 });
    }
    if (!targetAgent || !targetAgent.isActive) {
      return NextResponse.json({ error: "Target agent is not active" }, { status: 400 });
    }

    const currentMemberIds = dialog.members.map((member) => member.userId);
    if (!canManage) {
      const hasCurrentAccess =
        currentMemberIds.includes(accessResult.ctx.userId) || currentMemberIds.length === 0;
      if (!hasCurrentAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const targetAccess = await prisma.user.findUnique({
      where: { id: requestedAgentId },
      select: { id: true },
    });
    if (!targetAccess) {
      return NextResponse.json({ error: "Invalid agentId" }, { status: 400 });
    }

    const actorName = actor ? displayName(actor) : "System";
    const agentName = displayName(targetAgent);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.chatDialogMember.deleteMany({ where: { dialogId: dialog.id } });
      await tx.chatDialogMember.create({
        data: { dialogId: dialog.id, userId: requestedAgentId },
      });
      const payload = createMessagePayload({
        type: "system",
        text: `Assigned to ${agentName} by ${actorName}.`,
        seenByUserIds: [accessResult.ctx.userId, requestedAgentId],
      });
      await tx.chatMessage.create({
        data: {
          dialogId: dialog.id,
          userId: accessResult.ctx.userId,
          isSystem: true,
          content: serializeMessagePayload(payload),
        },
      });
      return tx.chatDialog.update({
        where: { id: dialog.id },
        data: { updatedAt: new Date() },
        include: {
          members: {
            include: {
              user: { select: { id: true, name: true, fullname: true, surname: true } },
            },
          },
        },
      });
    });

    if (requestedAgentId !== accessResult.ctx.userId) {
      await prisma.notification.create({
        data: {
          userId: requestedAgentId,
          type: "livechat",
          title: "New live chat assignment",
          body: `${actorName} assigned a conversation to you.`,
          link: `/livechat?dialog=${dialog.id}`,
          isRead: false,
        },
      });
    }

    return NextResponse.json({
      id: updated.id,
      assignedTo: updated.members.map((member) => ({
        id: member.user.id,
        name: displayName(member.user),
      })),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("[POST /api/livechat/dialogs/[id]/assign]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

