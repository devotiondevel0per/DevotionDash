import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess, type AccessContext } from "@/lib/api-access";

type RouteContext = { params: Promise<{ id: string }> };

function organizationAccessWhere(id: string, ctx: AccessContext) {
  if (ctx.access.isAdmin) return { id };
  return {
    id,
    OR: [
      { managerId: ctx.userId },
      { contacts: { some: { createdById: ctx.userId } } },
      { leads: { some: { ownerId: ctx.userId } } },
      { serviceDeskRequests: { some: { OR: [{ requesterId: ctx.userId }, { assigneeId: ctx.userId }] } } },
      { chatDialogs: { some: { members: { some: { userId: ctx.userId } } } } },
    ],
  };
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("clients", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const organization = await prisma.organization.findFirst({
      where: organizationAccessWhere(id, accessResult.ctx),
      select: { id: true },
    });
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const entries = await prisma.orgHistory.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        content: true,
        isSystem: true,
        createdAt: true,
      },
    });

    const userIds = [...new Set(entries.map((e) => e.userId).filter(Boolean))] as string[];
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, fullname: true },
          })
        : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    const result = entries.map((entry) => ({
      ...entry,
      user: entry.userId ? (userMap.get(entry.userId) ?? null) : null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/clients/[id]/history]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("clients", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const organization = await prisma.organization.findFirst({
      where: organizationAccessWhere(id, accessResult.ctx),
      select: { id: true },
    });
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const body = await req.json();
    const { content } = body as { content: string };

    if (!content || typeof content !== "string" || content.trim() === "") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const entry = await prisma.orgHistory.create({
      data: {
        organizationId: id,
        userId: accessResult.ctx.userId,
        content: content.trim(),
        isSystem: false,
      },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        content: true,
        isSystem: true,
        createdAt: true,
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: accessResult.ctx.userId },
      select: { id: true, name: true, fullname: true },
    });

    return NextResponse.json({ ...entry, user }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/clients/[id]/history]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
