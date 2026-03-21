import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

type RouteContext = { params: Promise<{ id: string }> };

async function getEventWithAccess(id: string, userId: string) {
  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, fullname: true } },
      calendar: {
        select: {
          id: true,
          name: true,
          color: true,
          type: true,
          ownerId: true,
          members: {
            select: { userId: true, canEdit: true },
          },
        },
      },
    },
  });

  if (!event || !event.calendar) {
    return { event: null, canRead: false, canEdit: false, canDelete: false };
  }

  const isOwner = event.calendar.ownerId === userId;
  const member = event.calendar.members.find((item) => item.userId === userId);
  const canRead = isOwner || Boolean(member);
  const canEdit = isOwner || Boolean(member?.canEdit);

  return {
    event,
    canRead,
    canEdit,
    canDelete: canEdit || event.creatorId === userId,
  };
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("calendar", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const userId = accessResult.ctx.userId;

    const { event, canRead } = await getEventWithAccess(id, userId);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    if (!canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    return NextResponse.json(event);
  } catch (error) {
    console.error("[GET /api/calendar/events/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("calendar", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const userId = accessResult.ctx.userId;
    const isAdmin = accessResult.ctx.access.isAdmin;

    const current = await getEventWithAccess(id, userId);
    if (!current.event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    if (!current.canEdit && !isAdmin && current.event.creatorId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { title, description, startDate, endDate, allDay, location, color } = body as {
      title?: string;
      description?: string | null;
      startDate?: string;
      endDate?: string;
      allDay?: boolean;
      location?: string | null;
      color?: string | null;
    };

    const data: Record<string, unknown> = {};

    if (title !== undefined) data.title = String(title).trim();
    if (description !== undefined) data.description = description && String(description).trim() ? String(description).trim() : null;
    if (location !== undefined) data.location = location && String(location).trim() ? String(location).trim() : null;
    if (allDay !== undefined) data.allDay = allDay;
    if (color !== undefined) data.color = color && String(color).trim() ? String(color).trim() : null;

    if (startDate !== undefined) {
      const parsed = new Date(startDate);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
      }
      data.startDate = parsed;
    }
    if (endDate !== undefined) {
      const parsed = new Date(endDate);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
      }
      data.endDate = parsed;
    }

    const start = (data.startDate as Date | undefined) ?? current.event.startDate;
    const end = (data.endDate as Date | undefined) ?? current.event.endDate;
    if (end < start) {
      return NextResponse.json({ error: "endDate must be after startDate" }, { status: 400 });
    }

    const event = await prisma.calendarEvent.update({
      where: { id },
      data,
      include: {
        creator: { select: { id: true, name: true, fullname: true } },
        calendar: { select: { id: true, name: true, color: true, type: true } },
      },
    });

    return NextResponse.json(event);
  } catch (error) {
    console.error("[PUT /api/calendar/events/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("calendar", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const userId = accessResult.ctx.userId;
    const isAdmin = accessResult.ctx.access.isAdmin;

    const current = await getEventWithAccess(id, userId);
    if (!current.event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    if (!current.canDelete && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.calendarEvent.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/calendar/events/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
