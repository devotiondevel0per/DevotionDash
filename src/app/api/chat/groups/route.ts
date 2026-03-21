import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const accessResult = await requireModuleAccess("chat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const groups = await prisma.chatServiceGroup.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(groups);
  } catch (error) {
    console.error("[GET /api/chat/groups]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("chat", "write");
  if (!accessResult.ok) return accessResult.response;

  if (!accessResult.ctx.access.permissions.chat.manage) {
    return NextResponse.json({ error: "Missing chat.manage permission" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      isPublic?: boolean;
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    const group = await prisma.chatServiceGroup.create({
      data: {
        name,
        description: body.description?.trim() || null,
        isPublic: Boolean(body.isPublic),
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
      },
    });

    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error("[POST /api/chat/groups]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
