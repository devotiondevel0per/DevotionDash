import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const ticket = await prisma.serviceDeskRequest.findUnique({
      where: { clientToken: token },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        clientName: true,
        clientEmail: true,
        category: { select: { name: true } },
        group: { select: { name: true } },
        assignee: { select: { name: true, fullname: true } },
        comments: {
          where: { isPublic: true },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            content: true,
            isSystem: true,
            createdAt: true,
            user: { select: { name: true, fullname: true } },
          },
        },
      },
    });

    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    return NextResponse.json({
      ...ticket,
      comments: ticket.comments.map((c) => ({
        id: c.id,
        content: c.content,
        isSystem: c.isSystem,
        createdAt: c.createdAt,
        authorName: c.isSystem ? "System" : (c.user?.fullname || c.user?.name || "Agent"),
        isAgent: !c.isSystem,
      })),
    });
  } catch (error) {
    console.error("[GET /api/public/tickets/[token]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
