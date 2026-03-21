import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess, type AccessContext } from "@/lib/api-access";

function requestAccessWhere(id: string, ctx: AccessContext) {
  if (ctx.access.isAdmin) return { id };
  return {
    id,
    OR: [{ requesterId: ctx.userId }, { assigneeId: ctx.userId }],
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessResult = await requireModuleAccess("servicedesk", "read");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;

  try {
    const request = await prisma.serviceDeskRequest.findFirst({
      where: requestAccessWhere(id, accessResult.ctx),
      select: { id: true },
    });
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const comments = await prisma.serviceDeskComment.findMany({
      where: { requestId: id },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
      },
    });

    return NextResponse.json(
      comments.map((comment) => ({
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
      }))
    );
  } catch (error) {
    console.error("[GET /api/servicedesk/[id]/comments]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessResult = await requireModuleAccess("servicedesk", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;

  try {
    const body = (await req.json()) as { content?: string };
    const content = body.content?.trim() ?? "";

    if (!content) {
      return NextResponse.json({ error: "Comment is required" }, { status: 400 });
    }

    const request = await prisma.serviceDeskRequest.findFirst({
      where: requestAccessWhere(id, accessResult.ctx),
      select: { id: true },
    });
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const created = await prisma.serviceDeskComment.create({
      data: {
        requestId: id,
        userId: accessResult.ctx.userId,
        content,
        isSystem: false,
      },
      include: {
        user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        content: created.content,
        isSystem: created.isSystem,
        createdAt: created.createdAt,
        author: created.user
          ? {
              id: created.user.id,
              name: created.user.name,
              fullname: created.user.fullname,
              photoUrl: created.user.photoUrl,
            }
          : null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/servicedesk/[id]/comments]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
