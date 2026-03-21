import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toLimit(value: string | null, fallback = 100) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 500);
}

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("calendar", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;
    const { searchParams } = new URL(req.url);

    const calendarId = searchParams.get("calendarId");
    const search = searchParams.get("search");
    const start = parseDate(searchParams.get("start"));
    const end = parseDate(searchParams.get("end"));
    const limit = toLimit(searchParams.get("limit"), 120);

    if ((searchParams.get("start") && !start) || (searchParams.get("end") && !end)) {
      return NextResponse.json({ error: "Invalid start or end date" }, { status: 400 });
    }

    if (start && end && end < start) {
      return NextResponse.json({ error: "end must be greater than start" }, { status: 400 });
    }

    const accessibleCalendars = await prisma.calendar.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      select: { id: true },
    });

    const accessibleIds = accessibleCalendars.map((calendar) => calendar.id);
    if (accessibleIds.length === 0) {
      return NextResponse.json([]);
    }

    if (calendarId && !accessibleIds.includes(calendarId)) {
      return NextResponse.json({ error: "Forbidden calendar" }, { status: 403 });
    }

    const where: Record<string, unknown> = {
      calendarId: calendarId ?? { in: accessibleIds },
    };

    const and: Record<string, unknown>[] = [];

    if (start) {
      and.push({ endDate: { gte: start } });
    }
    if (end) {
      and.push({ startDate: { lte: end } });
    }
    if (search && search.trim()) {
      and.push({
        OR: [
          { title: { contains: search.trim() } },
          { description: { contains: search.trim() } },
          { location: { contains: search.trim() } },
        ],
      });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    const events = await prisma.calendarEvent.findMany({
      where,
      take: limit,
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      include: {
        creator: { select: { id: true, name: true, fullname: true } },
        calendar: { select: { id: true, name: true, color: true, type: true } },
      },
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error("[GET /api/calendar/events]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("calendar", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const {
      calendarId,
      title,
      description,
      startDate,
      endDate,
      allDay,
      location,
      color,
    } = body as {
      calendarId: string;
      title: string;
      description?: string;
      startDate: string;
      endDate: string;
      allDay?: boolean;
      location?: string;
      color?: string;
    };

    if (!calendarId || !title || !startDate || !endDate) {
      return NextResponse.json(
        { error: "calendarId, title, startDate, and endDate are required" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid startDate or endDate" }, { status: 400 });
    }
    if (end < start) {
      return NextResponse.json({ error: "endDate must be after startDate" }, { status: 400 });
    }

    const userId = accessResult.ctx.userId;
    const calendar = await prisma.calendar.findFirst({
      where: {
        id: calendarId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId, canEdit: true } } },
        ],
      },
      select: { id: true },
    });

    if (!calendar) {
      return NextResponse.json({ error: "Forbidden calendar" }, { status: 403 });
    }

    const event = await prisma.calendarEvent.create({
      data: {
        calendarId,
        title: title.trim(),
        description: typeof description === "string" && description.trim() ? description.trim() : null,
        startDate: start,
        endDate: end,
        allDay: allDay ?? false,
        location: typeof location === "string" && location.trim() ? location.trim() : null,
        color: typeof color === "string" && color.trim() ? color.trim() : null,
        creatorId: userId,
      },
      include: {
        creator: { select: { id: true, name: true, fullname: true } },
        calendar: { select: { id: true, name: true, color: true, type: true } },
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("[POST /api/calendar/events]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
