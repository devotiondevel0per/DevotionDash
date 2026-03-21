import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { createDeletedByAdminPayload, parseMessagePayload, serializeMessagePayload } from "@/lib/chat-message";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("chat", "write");
  if (!accessResult.ok) return accessResult.response;

  if (!accessResult.ctx.access.permissions.chat.manage) {
    return NextResponse.json({ error: "Missing chat.manage permission" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.chatMessage.findUnique({
      where: { id },
      select: { id: true, content: true, dialog: { select: { isExternal: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (existing.dialog.isExternal) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const parsed = parseMessagePayload(existing.content);
    const deletedPayload = createDeletedByAdminPayload(parsed.payload);

    const updated = await prisma.chatMessage.update({
      where: { id },
      data: {
        content: serializeMessagePayload(deletedPayload),
      },
      include: {
        user: { select: { id: true, name: true, fullname: true, photoUrl: true, lastActivity: true } },
      },
    });

    return NextResponse.json({
      ...updated,
      payload: deletedPayload,
    });
  } catch (error) {
    console.error("[DELETE /api/chat/messages/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
