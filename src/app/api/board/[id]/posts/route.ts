import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  canManageBoardContent,
  canReadBoardTopic,
} from "@/lib/board-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("board", "read");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  try {
    const topic = await prisma.boardTopic.findUnique({
      where: { id },
      select: { id: true, creatorId: true, visibility: true, teamId: true },
    });
    if (!topic) return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    if (!canReadBoardTopic(topic, accessResult.ctx)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const posts = await prisma.boardPost.findMany({
      where: { topicId: id },
      include: { author: { select: { id: true, name: true, fullname: true, photoUrl: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(posts);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("board", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  try {
    const topic = await prisma.boardTopic.findUnique({
      where: { id },
      select: { id: true, creatorId: true, visibility: true, teamId: true, isLocked: true },
    });
    if (!topic) return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    if (!canReadBoardTopic(topic, accessResult.ctx)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      topic.isLocked &&
      !canManageBoardContent(accessResult.ctx) &&
      topic.creatorId !== accessResult.ctx.userId
    ) {
      return NextResponse.json(
        { error: "Topic is locked. Only managers can post." },
        { status: 423 }
      );
    }

    const { content } = await req.json() as { content?: string };
    if (!content?.trim()) return NextResponse.json({ error: "content is required" }, { status: 400 });

    const [post] = await Promise.all([
      prisma.boardPost.create({
        data: { topicId: id, authorId: accessResult.ctx.userId, content: content.trim() },
        include: { author: { select: { id: true, name: true, fullname: true, photoUrl: true } } },
      }),
      prisma.boardTopic.update({
        where: { id },
        data: { updatedAt: new Date(), lastActivityAt: new Date() },
      }),
    ]);
    return NextResponse.json(post, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
