import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess, type AccessContext } from "@/lib/api-access";
import { prisma } from "@/lib/prisma";
import { generateServiceDeskReply } from "@/lib/ai/servicedesk-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestAccessWhere(id: string, ctx: AccessContext) {
  if (ctx.access.isAdmin) return { id };
  return {
    id,
    OR: [{ requesterId: ctx.userId }, { assigneeId: ctx.userId }],
  };
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessResult = await requireModuleAccess("servicedesk", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;

  try {
    const request = await prisma.serviceDeskRequest.findFirst({
      where: requestAccessWhere(id, accessResult.ctx),
      include: {
        group: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, fullname: true } },
        assignee: { select: { id: true, name: true, fullname: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, name: true, fullname: true } },
          },
        },
      },
    });

    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const reply = await generateServiceDeskReply({
      request: {
        id: request.id,
        title: request.title,
        description: request.description,
        priority: request.priority,
        status: request.status,
        requesterName: request.requester?.fullname || request.requester?.name || "Customer",
        assigneeName: request.assignee?.fullname || request.assignee?.name || null,
        groupName: request.group?.name ?? null,
        categoryName: request.category?.name ?? null,
      },
      comments: request.comments.map((comment) => ({
        authorName: comment.user?.fullname || comment.user?.name || "Unknown",
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
      })),
    });

    return NextResponse.json(reply);
  } catch (error) {
    console.error("[POST /api/servicedesk/[id]/ai-reply]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
