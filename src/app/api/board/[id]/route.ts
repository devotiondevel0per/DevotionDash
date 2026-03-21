import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  canManageBoardContent,
  canModifyBoardTopic,
  canReadBoardTopic,
  getTeamIdsFromAccess,
  normalizeBoardVisibility,
} from "@/lib/board-access";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("board", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const topic = await prisma.boardTopic.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, fullname: true, photoUrl: true } },
        resolvedBy: { select: { id: true, name: true, fullname: true } },
        category: { select: { id: true, name: true, color: true, description: true } },
        team: { select: { id: true, name: true, color: true } },
        organization: { select: { id: true, name: true, type: true } },
        posts: {
          include: {
            author: { select: { id: true, name: true, fullname: true, photoUrl: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { posts: true } },
      },
    });

    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    if (!canReadBoardTopic(topic, accessResult.ctx)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(topic);
  } catch (error) {
    console.error("[GET /api/board/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("board", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const body = (await req.json()) as {
      title?: string;
      description?: string | null;
      isPinned?: boolean;
      isLocked?: boolean;
      isResolved?: boolean;
      categoryId?: string;
      visibility?: string;
      teamId?: string | null;
      organizationId?: string | null;
    };

    const existing = await prisma.boardTopic.findUnique({
      where: { id },
      select: {
        id: true,
        creatorId: true,
        visibility: true,
        teamId: true,
        organizationId: true,
        isResolved: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    if (!canReadBoardTopic(existing, accessResult.ctx)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const canManage = canManageBoardContent(accessResult.ctx);
    const canModify = canModifyBoardTopic(existing, accessResult.ctx);
    if (!canModify) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim() === "") {
        return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
      }
      updateData.title = body.title.trim();
    }

    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== "string") {
        return NextResponse.json({ error: "description must be text" }, { status: 400 });
      }
      updateData.description =
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null;
    }

    if (body.categoryId !== undefined) {
      const category = await prisma.boardCategory.findUnique({
        where: { id: body.categoryId },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      updateData.categoryId = body.categoryId;
    }

    if (typeof body.isPinned === "boolean") {
      if (!canManage) {
        return NextResponse.json({ error: "Only managers can pin topics" }, { status: 403 });
      }
      updateData.isPinned = body.isPinned;
    }

    if (typeof body.isLocked === "boolean") {
      if (!canManage) {
        return NextResponse.json({ error: "Only managers can lock topics" }, { status: 403 });
      }
      updateData.isLocked = body.isLocked;
    }

    if (typeof body.isResolved === "boolean") {
      if (body.isResolved) {
        updateData.isResolved = true;
        updateData.resolvedAt = new Date();
        updateData.resolvedById = accessResult.ctx.userId;
      } else {
        updateData.isResolved = false;
        updateData.resolvedAt = null;
        updateData.resolvedById = null;
      }
    }

    if (body.visibility !== undefined || body.teamId !== undefined || body.organizationId !== undefined) {
      const visibility = normalizeBoardVisibility(body.visibility, normalizeBoardVisibility(existing.visibility));
      const teamId =
        body.teamId === undefined
          ? existing.teamId
          : typeof body.teamId === "string" && body.teamId.trim()
            ? body.teamId
            : null;
      const organizationId =
        body.organizationId === undefined
          ? existing.organizationId
          : typeof body.organizationId === "string" && body.organizationId.trim()
            ? body.organizationId
            : null;

      if (visibility === "team" && !teamId) {
        return NextResponse.json(
          { error: "teamId is required for team visibility" },
          { status: 400 }
        );
      }

      if (teamId) {
        const team = await prisma.group.findUnique({
          where: { id: teamId },
          select: { id: true },
        });
        if (!team) {
          return NextResponse.json({ error: "Invalid team selection" }, { status: 400 });
        }
        const teamIds = getTeamIdsFromAccess(accessResult.ctx);
        if (!canManage && !teamIds.includes(teamId)) {
          return NextResponse.json(
            { error: "You can only post in your own team boards" },
            { status: 403 }
          );
        }
      }

      if (organizationId) {
        const organization = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { id: true },
        });
        if (!organization) {
          return NextResponse.json({ error: "Invalid organization selection" }, { status: 400 });
        }
      }

      updateData.visibility = visibility;
      updateData.teamId = visibility === "team" ? teamId : null;
      updateData.organizationId = visibility === "organization" ? organizationId : null;
    }

    const updated = await prisma.boardTopic.update({
      where: { id },
      data: updateData,
      include: {
        creator: { select: { id: true, name: true, fullname: true } },
        resolvedBy: { select: { id: true, name: true, fullname: true } },
        category: { select: { id: true, name: true, color: true, description: true } },
        team: { select: { id: true, name: true, color: true } },
        organization: { select: { id: true, name: true, type: true } },
        _count: { select: { posts: true } },
        posts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { id: true, fullname: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PUT /api/board/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("board", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const topic = await prisma.boardTopic.findUnique({
      where: { id },
      select: { id: true, creatorId: true, visibility: true, teamId: true },
    });
    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    if (!canReadBoardTopic(topic, accessResult.ctx)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!canModifyBoardTopic(topic, accessResult.ctx)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.boardTopic.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/board/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
