import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("servicedesk", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 100), 1), 300);

    const and: Prisma.ServiceDeskRequestWhereInput[] = [];
    if (!accessResult.ctx.access.isAdmin) {
      and.push({
        OR: [{ requesterId: accessResult.ctx.userId }, { assigneeId: accessResult.ctx.userId }],
      });
    }
    if (groupId) and.push({ groupId });
    if (status) and.push({ status });
    if (search) {
      and.push({
        OR: [{ title: { contains: search } }, { description: { contains: search } }],
      });
    }

    const requests = await prisma.serviceDeskRequest.findMany({
      where: and.length > 0 ? { AND: and } : {},
      include: {
        group: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, fullname: true } },
        assignee: { select: { id: true, name: true, fullname: true } },
        organization: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    return NextResponse.json(
      requests.map((request) => ({
        ...request,
        commentsCount: request._count.comments,
      }))
    );
  } catch (error) {
    console.error("[GET /api/servicedesk]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("servicedesk", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as {
      title?: string;
      description?: string;
      groupId?: string;
      categoryId?: string;
      assigneeId?: string;
      organizationId?: string;
      priority?: string;
    };

    const title = body.title?.trim() ?? "";
    const description = body.description?.trim() ?? "";
    if (!title || !description) {
      return NextResponse.json({ error: "title and description are required" }, { status: 400 });
    }

    if (
      !accessResult.ctx.access.isAdmin &&
      body.assigneeId &&
      body.assigneeId !== accessResult.ctx.userId
    ) {
      return NextResponse.json(
        { error: "Forbidden: you can only assign requests to yourself" },
        { status: 403 }
      );
    }

    const resolvedGroup = body.groupId
      ? await prisma.serviceDeskGroup.findFirst({
          where: { id: body.groupId, isActive: true },
          select: { id: true },
        })
      : await prisma.serviceDeskGroup.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });

    if (!resolvedGroup) {
      return NextResponse.json(
        { error: "No active service desk group found. Create one first." },
        { status: 400 }
      );
    }

    const request = await prisma.serviceDeskRequest.create({
      data: {
        title,
        description,
        groupId: resolvedGroup.id,
        categoryId: body.categoryId ?? null,
        assigneeId: body.assigneeId ?? null,
        organizationId: body.organizationId ?? null,
        priority: body.priority ?? "normal",
        requesterId: accessResult.ctx.userId,
      },
      include: {
        group: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, fullname: true } },
        assignee: { select: { id: true, name: true, fullname: true } },
        organization: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(request, { status: 201 });
  } catch (error) {
    console.error("[POST /api/servicedesk]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
