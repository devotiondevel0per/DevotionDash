import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { canManageLiveChat } from "@/lib/livechat-access";

export async function GET() {
  const accessResult = await requireModuleAccess("livechat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const groups = await prisma.chatServiceGroup.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        dialogs: {
          where: {
            isExternal: true,
            status: "open",
          },
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      items: groups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        isPublic: group.isPublic,
        openCount: group.dialogs.length,
      })),
    });
  } catch (error) {
    console.error("[GET /api/livechat/groups]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("livechat", "write");
  if (!accessResult.ok) return accessResult.response;

  if (!canManageLiveChat(accessResult.ctx.access)) {
    return NextResponse.json({ error: "Only managers can create queues" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      isPublic?: boolean;
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Queue name is required" }, { status: 400 });
    }

    const created = await prisma.chatServiceGroup.create({
      data: {
        name,
        description: body.description?.trim() || null,
        isPublic: Boolean(body.isPublic),
        isActive: true,
      },
      select: { id: true, name: true, description: true, isPublic: true },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[POST /api/livechat/groups]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

