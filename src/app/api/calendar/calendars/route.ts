import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

function clean(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export async function GET() {
  const accessResult = await requireModuleAccess("calendar", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;

    const calendars = await prisma.calendar.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: {
        members: {
          select: {
            id: true,
            userId: true,
            canEdit: true,
            user: { select: { id: true, name: true, fullname: true } },
          },
          orderBy: { userId: "asc" },
        },
      },
    });

    return NextResponse.json(calendars);
  } catch (error) {
    console.error("[GET /api/calendar/calendars]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("calendar", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const name = clean(body?.name);
    const colorInput = clean(body?.color);
    const typeInput = clean(body?.type).toLowerCase();

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const color = isHexColor(colorInput) ? colorInput : "#FE0000";
    const type = typeInput === "shared" ? "shared" : "personal";

    const userId = accessResult.ctx.userId;

    const calendar = await prisma.calendar.create({
      data: {
        name,
        color,
        type,
        ownerId: userId,
        members: {
          create: {
            userId,
            canEdit: true,
          },
        },
      },
      include: {
        members: {
          select: {
            id: true,
            userId: true,
            canEdit: true,
            user: { select: { id: true, name: true, fullname: true } },
          },
        },
      },
    });

    return NextResponse.json(calendar, { status: 201 });
  } catch (error) {
    console.error("[POST /api/calendar/calendars]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
