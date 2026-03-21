import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  canManageBoardContent,
  canReadBoardTopic,
} from "@/lib/board-access";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  const accessResult = await requireModuleAccess("board", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id, postId } = await params;
  try {
    const { content } = await req.json() as { content?: string };
    if (!content?.trim()) return NextResponse.json({ error: "content is required" }, { status: 400 });

    const post = await prisma.boardPost.findUnique({
      where: { id: postId },
      include: {
        topic: {
          select: {
            id: true,
            creatorId: true,
            visibility: true,
            teamId: true,
            isLocked: true,
          },
        },
      },
    });
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    if (post.topicId !== id) {
      return NextResponse.json({ error: "Post not found in this topic" }, { status: 404 });
    }
    if (!canReadBoardTopic(post.topic, accessResult.ctx)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, access } = accessResult.ctx;
    const canManage = canManageBoardContent(accessResult.ctx);
    if (post.authorId !== userId && !access.isAdmin && !access.permissions.board.manage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (post.topic.isLocked && !canManage && post.topic.creatorId !== userId) {
      return NextResponse.json(
        { error: "Topic is locked. Only managers can edit posts." },
        { status: 423 }
      );
    }

    const [updated] = await Promise.all([
      prisma.boardPost.update({
        where: { id: postId },
        data: { content: content.trim() },
        include: { author: { select: { id: true, name: true, fullname: true, photoUrl: true } } },
      }),
      prisma.boardTopic.update({
        where: { id: post.topicId },
        data: { lastActivityAt: new Date() },
      }),
    ]);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PUT /api/board/[id]/posts/[postId]]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  const accessResult = await requireModuleAccess("board", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id, postId } = await params;
  try {
    const post = await prisma.boardPost.findUnique({
      where: { id: postId },
      include: {
        topic: {
          select: {
            id: true,
            creatorId: true,
            visibility: true,
            teamId: true,
            isLocked: true,
          },
        },
      },
    });
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    if (post.topicId !== id) {
      return NextResponse.json({ error: "Post not found in this topic" }, { status: 404 });
    }
    if (!canReadBoardTopic(post.topic, accessResult.ctx)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, access } = accessResult.ctx;
    const canManage = canManageBoardContent(accessResult.ctx);
    if (post.authorId !== userId && !access.isAdmin && !access.permissions.board.manage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (post.topic.isLocked && !canManage && post.topic.creatorId !== userId) {
      return NextResponse.json(
        { error: "Topic is locked. Only managers can delete posts." },
        { status: 423 }
      );
    }

    await Promise.all([
      prisma.boardPost.delete({ where: { id: postId } }),
      prisma.boardTopic.update({
        where: { id: post.topicId },
        data: { lastActivityAt: new Date() },
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/board/[id]/posts/[postId]]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
