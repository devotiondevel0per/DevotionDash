import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ widgetToken: string }> }) {
  const { widgetToken } = await params;
  try {
    const widget = await prisma.ticketWidget.findUnique({
      where: { token: widgetToken },
      select: {
        enabled: true,
        brandLabel: true,
        logoUrl: true,
        welcomeText: true,
        accentColor: true,
        position: true,
        allowDomains: true,
        defaultGroupId: true,
      },
    });
    if (!widget) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!widget.enabled) return NextResponse.json({ error: "Widget disabled" }, { status: 403 });

    // Load categories for default group
    let categories: { id: string; name: string }[] = [];
    if (widget.defaultGroupId) {
      categories = await prisma.serviceDeskCategory.findMany({
        where: { groupId: widget.defaultGroupId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    }

    return NextResponse.json({ ...widget, categories });
  } catch (error) {
    console.error("[GET /api/public/tickets/widget/[widgetToken]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
