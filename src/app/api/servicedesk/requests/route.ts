import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { loadServiceDeskStages, getDefaultStage } from "@/lib/workflow-config";

const ALLOWED_PRIORITIES = new Set(["high", "normal", "low"]);

function mapRequest(request: {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  group: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  requester: { id: string; name: string; fullname: string } | null;
  assignee: { id: string; name: string; fullname: string } | null;
  organization: { id: string; name: string } | null;
  _count?: { comments: number };
}) {
  return {
    id: request.id,
    title: request.title,
    description: request.description,
    status: request.status,
    priority: request.priority,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    closedAt: request.closedAt,
    group: request.group,
    category: request.category,
    requester: request.requester,
    assignee: request.assignee,
    organization: request.organization,
    commentsCount: request._count?.comments ?? 0,
  };
}

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("servicedesk", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const groupId = searchParams.get("groupId");
    const assigneeId = searchParams.get("assigneeId");
    const requesterId = searchParams.get("requesterId");
    const search = searchParams.get("search");
    const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "100", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 100;

    const stages = await loadServiceDeskStages();
    const allowedStatuses = new Set(stages.map((s) => s.key));

    const where: Prisma.ServiceDeskRequestWhereInput = {};
    const and: Prisma.ServiceDeskRequestWhereInput[] = [];

    if (!accessResult.ctx.access.isAdmin) {
      and.push({
        OR: [{ requesterId: accessResult.ctx.userId }, { assigneeId: accessResult.ctx.userId }],
      });
    }

    if (status && allowedStatuses.has(status)) and.push({ status });
    if (groupId) and.push({ groupId });
    if (assigneeId) and.push({ assigneeId });
    if (requesterId) and.push({ requesterId });

    if (search?.trim()) {
      const q = search.trim();
      and.push({
        OR: [
          { title: { contains: q } },
          { description: { contains: q } },
          { requester: { fullname: { contains: q } } },
          { requester: { name: { contains: q } } },
          { assignee: { fullname: { contains: q } } },
          { assignee: { name: { contains: q } } },
        ],
      });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    const requests = await prisma.serviceDeskRequest.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        group: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, fullname: true } },
        assignee: { select: { id: true, name: true, fullname: true } },
        organization: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json({ items: requests.map(mapRequest), stages });
  } catch (error) {
    console.error("[GET /api/servicedesk/requests]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("servicedesk", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as {
      groupId?: string;
      categoryId?: string;
      assigneeId?: string;
      organizationId?: string;
      title?: string;
      description?: string;
      priority?: string;
    };

    const title = body.title?.trim() ?? "";
    const description = body.description?.trim() ?? "";
    if (!title || !description) {
      return NextResponse.json({ error: "title and description are required" }, { status: 400 });
    }

    const priority = (body.priority ?? "normal").toLowerCase();
    if (!ALLOWED_PRIORITIES.has(priority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
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

    if (body.categoryId) {
      const category = await prisma.serviceDeskCategory.findFirst({
        where: { id: body.categoryId, groupId: resolvedGroup.id },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json({ error: "Category does not belong to selected group" }, { status: 400 });
      }
    }

    if (body.assigneeId) {
      const assignee = await prisma.user.findUnique({
        where: { id: body.assigneeId },
        select: { id: true, isActive: true },
      });
      if (!assignee || !assignee.isActive) {
        return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
      }
    }

    if (body.organizationId) {
      const organization = await prisma.organization.findUnique({
        where: { id: body.organizationId },
        select: { id: true },
      });
      if (!organization) {
        return NextResponse.json({ error: "Organization not found" }, { status: 400 });
      }
    }

    const sdStages = await loadServiceDeskStages();
    const defaultSdStage = getDefaultStage(sdStages);

    const created = await prisma.serviceDeskRequest.create({
      data: {
        groupId: resolvedGroup.id,
        categoryId: body.categoryId ?? null,
        assigneeId: body.assigneeId ?? null,
        organizationId: body.organizationId ?? null,
        requesterId: accessResult.ctx.userId,
        title,
        description,
        priority,
        status: defaultSdStage.key,
      },
      include: {
        group: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, fullname: true } },
        assignee: { select: { id: true, name: true, fullname: true } },
        organization: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json(mapRequest(created), { status: 201 });
  } catch (error) {
    console.error("[POST /api/servicedesk/requests]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
