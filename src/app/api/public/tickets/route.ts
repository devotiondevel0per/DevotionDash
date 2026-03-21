import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      widgetToken?: string;
      clientName?: string;
      clientEmail?: string;
      title?: string;
      description?: string;
      categoryId?: string;
    };

    const clientName = body.clientName?.trim() ?? "";
    const clientEmail = body.clientEmail?.trim().toLowerCase() ?? "";
    const title = body.title?.trim() ?? "";
    const description = body.description?.trim() ?? "";

    if (!clientName || !clientEmail || !title || !description) {
      return NextResponse.json({ error: "name, email, subject and message are required" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    // Resolve widget → default group
    let groupId: string | null = null;
    if (body.widgetToken) {
      const widget = await prisma.ticketWidget.findUnique({
        where: { token: body.widgetToken },
        select: { enabled: true, defaultGroupId: true },
      });
      if (!widget || !widget.enabled) {
        return NextResponse.json({ error: "Widget not found or disabled" }, { status: 404 });
      }
      groupId = widget.defaultGroupId;
    }

    // Fall back to first active group
    if (!groupId) {
      const firstGroup = await prisma.serviceDeskGroup.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!firstGroup) {
        return NextResponse.json({ error: "Service desk not configured" }, { status: 503 });
      }
      groupId = firstGroup.id;
    }

    // Find or create a system user for external tickets (use first admin)
    const adminUser = await prisma.user.findFirst({
      where: { isAdmin: true, isActive: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!adminUser) {
      return NextResponse.json({ error: "Service desk not configured" }, { status: 503 });
    }

    const clientToken = randomBytes(24).toString("hex");

    const ticket = await prisma.serviceDeskRequest.create({
      data: {
        title,
        description,
        groupId,
        categoryId: body.categoryId ?? null,
        requesterId: adminUser.id,
        source: "widget",
        clientEmail,
        clientName,
        clientToken,
        priority: "normal",
        status: "open",
      },
      select: { id: true, clientToken: true, title: true, status: true, createdAt: true },
    });

    return NextResponse.json({
      id: ticket.id,
      token: ticket.clientToken,
      title: ticket.title,
      status: ticket.status,
      createdAt: ticket.createdAt,
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/public/tickets]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
