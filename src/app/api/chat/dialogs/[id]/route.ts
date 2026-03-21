import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { ensureSeenBy, parseMessagePayload, serializeMessagePayload } from "@/lib/chat-message";
import { isMalformedDirectDialog, withCanonicalDialogSubject } from "@/lib/chat-dialogs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("chat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const dialog = await prisma.chatDialog.findFirst({
      where: { id, isExternal: false },
      include: {
        group: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, fullname: true, photoUrl: true, isActive: true, lastActivity: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            user: { select: { id: true, name: true, fullname: true, photoUrl: true, isActive: true, lastActivity: true } },
          },
        },
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

    const messageRows = dialog.messages.reverse();
    const updates: Array<{ id: string; content: string }> = [];
    const messages = messageRows.map((message) => {
      const parsed = parseMessagePayload(message.content);
      if (message.userId !== accessResult.ctx.userId) {
        const seen = ensureSeenBy(parsed.payload, accessResult.ctx.userId);
        if (seen.changed) {
          updates.push({ id: message.id, content: serializeMessagePayload(seen.payload) });
          return { ...message, payload: seen.payload };
        }
      }
      return { ...message, payload: parsed.payload };
    });

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((entry) =>
          prisma.chatMessage.update({
            where: { id: entry.id },
            data: { content: entry.content },
          })
        )
      );
    }

    await prisma.user.update({
      where: { id: accessResult.ctx.userId },
      data: { lastActivity: new Date() },
    });

    return NextResponse.json(
      withCanonicalDialogSubject({
        ...dialog,
        messages,
      })
    );
  } catch (error) {
    console.error("[GET /api/chat/dialogs/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("chat", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.chatDialog.findFirst({
      where: { id, isExternal: false },
      select: {
        id: true,
        members: { select: { userId: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Dialog not found" }, { status: 404 });
    }

    if (
      !accessResult.ctx.access.permissions.chat.manage &&
      !existing.members.some((member) => member.userId === accessResult.ctx.userId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.subject !== undefined) updateData.subject = body.subject;
    if (body.status) {
      const validStatuses = ["open", "closed"];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: `status must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.status = body.status;
    }

    const updated = await prisma.chatDialog.update({
      where: { id },
      data: updateData,
      include: {
        group: { select: { id: true, name: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PUT /api/chat/dialogs/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
