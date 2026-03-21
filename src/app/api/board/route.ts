import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import type { Prisma } from "@prisma/client";
import {
  buildBoardReadFilter,
  canManageBoardContent,
  getTeamIdsFromAccess,
  normalizeBoardVisibility,
} from "@/lib/board-access";

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("board", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const search = searchParams.get("search");
    const visibility = searchParams.get("visibility");
    const status = searchParams.get("status");
    const mine = searchParams.get("mine");
    const teamId = searchParams.get("teamId");
    const organizationId = searchParams.get("organizationId");
    const sort = searchParams.get("sort");
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "50", 10), 1),
      300
    );

    const filters: Prisma.BoardTopicWhereInput[] = [buildBoardReadFilter(accessResult.ctx)];
    if (categoryId && categoryId !== "all") filters.push({ categoryId });
    if (search) {
      filters.push({
        OR: [
          { title: { contains: search } },
          { description: { contains: search } },
          { creator: { fullname: { contains: search } } },
          { creator: { name: { contains: search } } },
        ],
      });
    }
    if (visibility) filters.push({ visibility: normalizeBoardVisibility(visibility) });
    if (status === "open") filters.push({ isResolved: false });
    if (status === "resolved") filters.push({ isResolved: true });
    if (mine === "1") filters.push({ creatorId: accessResult.ctx.userId });
    if (teamId) filters.push({ teamId });
    if (organizationId) filters.push({ organizationId });

    const where: Prisma.BoardTopicWhereInput =
      filters.length === 1 ? filters[0] : { AND: filters };

    const orderBy: Prisma.BoardTopicOrderByWithRelationInput[] = [{ isPinned: "desc" }];
    if (sort === "oldest") {
      orderBy.push({ createdAt: "asc" });
    } else if (sort === "most_replies") {
      orderBy.push({ posts: { _count: "desc" } });
      orderBy.push({ lastActivityAt: "desc" });
    } else {
      orderBy.push({ lastActivityAt: "desc" });
    }

    const topics = await prisma.boardTopic.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, fullname: true } },
        category: { select: { id: true, name: true, color: true, description: true } },
        team: { select: { id: true, name: true, color: true } },
        organization: { select: { id: true, name: true, type: true } },
        resolvedBy: { select: { id: true, name: true, fullname: true } },
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
      orderBy,
      take: limit,
    });

    return NextResponse.json(topics);
  } catch (error) {
    console.error("[GET /api/board]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("board", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const {
      title,
      description,
      categoryId,
      visibility: visibilityRaw,
      teamId: teamIdRaw,
      organizationId: organizationIdRaw,
      isPinned,
    } = body as {
      title?: string;
      description?: string;
      categoryId?: string;
      visibility?: string;
      teamId?: string | null;
      organizationId?: string | null;
      isPinned?: boolean;
    };

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!categoryId) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    const category = await prisma.boardCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const visibility = normalizeBoardVisibility(visibilityRaw, "organization");
    const teamId = typeof teamIdRaw === "string" && teamIdRaw.trim() ? teamIdRaw : null;
    const organizationId =
      typeof organizationIdRaw === "string" && organizationIdRaw.trim()
        ? organizationIdRaw
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
      if (!canManageBoardContent(accessResult.ctx) && !teamIds.includes(teamId)) {
        return NextResponse.json(
          { error: "You can only post in your own team boards" },
          { status: 403 }
        );
      }
    }

    if (organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!org) {
        return NextResponse.json(
          { error: "Invalid organization selection" },
          { status: 400 }
        );
      }
    }

    const topic = await prisma.boardTopic.create({
      data: {
        title: title.trim(),
        description: typeof description === "string" && description.trim()
          ? description.trim()
          : null,
        categoryId,
        visibility,
        teamId: visibility === "team" ? teamId : null,
        organizationId: visibility === "organization" ? organizationId : null,
        isPinned: canManageBoardContent(accessResult.ctx) ? Boolean(isPinned) : false,
        creatorId: accessResult.ctx.userId,
        lastActivityAt: new Date(),
      },
      include: {
        creator: { select: { id: true, name: true, fullname: true } },
        category: { select: { id: true, name: true, color: true, description: true } },
        team: { select: { id: true, name: true, color: true } },
        organization: { select: { id: true, name: true, type: true } },
        resolvedBy: { select: { id: true, name: true, fullname: true } },
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

    return NextResponse.json(topic, { status: 201 });
  } catch (error) {
    console.error("[POST /api/board]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
