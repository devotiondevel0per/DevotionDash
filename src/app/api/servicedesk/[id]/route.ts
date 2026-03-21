import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess, type AccessContext } from "@/lib/api-access";
import { prisma } from "@/lib/prisma";
import { loadServiceDeskStages, isClosedStage } from "@/lib/workflow-config";

const ALLOWED_PRIORITIES = new Set(["high", "normal", "low"]);

type RawRequestDetails = {
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
  requester: { id: string; name: string; fullname: string; photoUrl: string | null } | null;
  assignee: { id: string; name: string; fullname: string; photoUrl: string | null } | null;
  organization: { id: string; name: string } | null;
  comments: Array<{
    id: string;
    content: string;
    isSystem: boolean;
    createdAt: Date;
    user: { id: string; name: string; fullname: string; photoUrl: string | null };
  }>;
  _count?: { comments: number };
};

function mapDetails(request: RawRequestDetails) {
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
    commentsCount: request._count?.comments ?? request.comments.length,
    comments: request.comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      isSystem: comment.isSystem,
      createdAt: comment.createdAt,
      author: comment.user
        ? {
            id: comment.user.id,
            name: comment.user.name,
            fullname: comment.user.fullname,
            photoUrl: comment.user.photoUrl,
          }
        : null,
    })),
  };
}

function requestAccessWhere(id: string, ctx: AccessContext) {
  if (ctx.access.isAdmin) return { id };
  return {
    id,
    OR: [{ requesterId: ctx.userId }, { assigneeId: ctx.userId }],
  };
}

async function loadRequest(id: string, ctx: AccessContext) {
  return prisma.serviceDeskRequest.findFirst({
    where: requestAccessWhere(id, ctx),
    include: {
      group: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true, fullname: true, photoUrl: true } },
      assignee: { select: { id: true, name: true, fullname: true, photoUrl: true } },
      organization: { select: { id: true, name: true } },
      comments: {
        include: {
          user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { comments: true } },
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessResult = await requireModuleAccess("servicedesk", "read");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;

  try {
    const request = await loadRequest(id, accessResult.ctx);
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(mapDetails(request as RawRequestDetails));
  } catch (error) {
    console.error("[GET /api/servicedesk/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function updateRequest(
  id: string,
  ctx: AccessContext,
  body: {
    status?: string;
    priority?: string;
    assigneeId?: string | null;
    comment?: string;
  }
) {
  const existing = await prisma.serviceDeskRequest.findFirst({
    where: requestAccessWhere(id, ctx),
  });
  if (!existing) return { notFound: true as const };

  const sdStages = await loadServiceDeskStages();
  const allowedStatuses = new Set(sdStages.map((s) => s.key));

  const nextStatus = body.status?.trim().toLowerCase();
  if (nextStatus && !allowedStatuses.has(nextStatus)) {
    return { error: "Invalid status" } as const;
  }

  const nextPriority = body.priority?.trim().toLowerCase();
  if (nextPriority && !ALLOWED_PRIORITIES.has(nextPriority)) {
    return { error: "Invalid priority" } as const;
  }

  const nextAssigneeId = body.assigneeId === "" ? null : body.assigneeId;
  if (!ctx.access.isAdmin && nextAssigneeId && nextAssigneeId !== ctx.userId) {
    return { error: "Forbidden: you can only assign requests to yourself" } as const;
  }

  if (nextAssigneeId) {
    const assignee = await prisma.user.findUnique({
      where: { id: nextAssigneeId },
      select: { id: true, isActive: true },
    });
    if (!assignee || !assignee.isActive) {
      return { error: "Invalid assignee" } as const;
    }
  }

  const note = body.comment?.trim() ?? "";
  const statusChanged = Boolean(nextStatus && nextStatus !== existing.status);
  if (statusChanged && !note) {
    return { error: "Comment required when changing status" } as const;
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceDeskRequest.update({
      where: { id },
      data: {
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(nextPriority ? { priority: nextPriority } : {}),
        ...(body.assigneeId !== undefined ? { assigneeId: nextAssigneeId ?? null } : {}),
        ...(statusChanged
          ? {
              closedAt: nextStatus && isClosedStage(sdStages, nextStatus) ? new Date() : null,
            }
          : {}),
      },
    });

    if (note) {
      await tx.serviceDeskComment.create({
        data: {
          requestId: id,
          userId: ctx.userId,
          content: note,
          isSystem: false,
        },
      });
    }
  });

  const updated = await loadRequest(id, ctx);
  if (!updated) return { notFound: true as const };

  return { request: mapDetails(updated as RawRequestDetails) } as const;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessResult = await requireModuleAccess("servicedesk", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;

  try {
    const body = (await req.json()) as {
      status?: string;
      priority?: string;
      assigneeId?: string | null;
      comment?: string;
    };

    const result = await updateRequest(id, accessResult.ctx, body);
    if ("notFound" in result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json(result.request);
  } catch (error) {
    console.error("[PUT /api/servicedesk/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Backward compatibility for older frontend calls.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return PUT(req, ctx);
}
