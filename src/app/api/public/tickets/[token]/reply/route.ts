import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const body = (await req.json()) as { content?: string };
    const content = body.content?.trim() ?? "";
    if (!content) return NextResponse.json({ error: "Message is required" }, { status: 400 });

    const ticket = await prisma.serviceDeskRequest.findUnique({
      where: { clientToken: token },
      select: { id: true, status: true, requesterId: true },
    });
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    if (ticket.status === "closed") {
      return NextResponse.json({ error: "This ticket is closed" }, { status: 400 });
    }

    const comment = await prisma.serviceDeskComment.create({
      data: {
        requestId: ticket.id,
        userId: ticket.requesterId,
        content,
        isSystem: false,
        isPublic: true,
      },
      select: { id: true, content: true, createdAt: true },
    });

    // Reopen if pending
    if (ticket.status === "pending") {
      await prisma.serviceDeskRequest.update({
        where: { id: ticket.id },
        data: { status: "open" },
      });
    }

    return NextResponse.json({ id: comment.id, content: comment.content, createdAt: comment.createdAt }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/public/tickets/[token]/reply]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
