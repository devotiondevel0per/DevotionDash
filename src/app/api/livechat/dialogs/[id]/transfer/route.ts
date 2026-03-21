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
    const targetAgentId = body.agentId?.trim();
    if (!targetAgentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const canManage = canManageLiveChat(accessResult.ctx.access);
    const [dialog, actor, targetAgent] = await Promise.all([
      prisma.chatDialog.findUnique({
        where: { id },
        include: {
          members: {
            include: {
              user: { select: { id: true, name: true, fullname: true, surname: true } },
            },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: accessResult.ctx.userId },
        select: { id: true, name: true, fullname: true, surname: true },
      }),
      prisma.user.findUnique({
        where: { id: targetAgentId },
        select: { id: true, name: true, fullname: true, surname: true, isActive: true },
      }),
    ]);

    if (!dialog || !dialog.isExternal) {
      return NextResponse.json({ error: "Live chat dialog not found" }, { status: 404 });
    }
    if (!targetAgent || !targetAgent.isActive) {
      return NextResponse.json({ error: "Target agent is not active" }, { status: 400 });
    }

    const assignedIds = dialog.members.map((member) => member.userId);
    const actorIsAssigned = assignedIds.includes(accessResult.ctx.userId);
    if (!canManage && !actorIsAssigned) {
      return NextResponse.json({ error: "Only assigned agent can transfer this chat" }, { status: 403 });
    }
    if (!canManage && targetAgentId === accessResult.ctx.userId) {
      return NextResponse.json({ error: "Target agent must be different for transfer" }, { status: 400 });
    }

    const previousAssignee = dialog.members[0]?.user;
    const previousName = previousAssignee ? displayName(previousAssignee) : "Unassigned";
    const actorName = actor ? displayName(actor) : "System";
    const targetName = displayName(targetAgent);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.chatDialogMember.deleteMany({ where: { dialogId: dialog.id } });
      await tx.chatDialogMember.create({
        data: { dialogId: dialog.id, userId: targetAgentId },
      });

      const payload = createMessagePayload({
        type: "system",
        text: `Transferred from ${previousName} to ${targetName} by ${actorName}.`,
        seenByUserIds: [accessResult.ctx.userId, targetAgentId],
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

    if (targetAgentId !== accessResult.ctx.userId) {
      await prisma.notification.create({
        data: {
          userId: targetAgentId,
          type: "livechat",
          title: "Live chat transferred to you",
          body: `${actorName} transferred a conversation to you.`,
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
    console.error("[POST /api/livechat/dialogs/[id]/transfer]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

