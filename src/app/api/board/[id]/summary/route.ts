import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { canReadBoardTopic } from "@/lib/board-access";
import { generateBoardSummary } from "@/lib/ai/board-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("board", "read");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;

  try {
    const topic = await prisma.boardTopic.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        posts: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, name: true, fullname: true } },
          },
        },
      },
    });

    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    if (!canReadBoardTopic(topic, accessResult.ctx)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const summary = await generateBoardSummary({
      topic: {
        id: topic.id,
        title: topic.title,
        description: topic.description,
        categoryName: topic.category?.name ?? null,
        visibility: topic.visibility,
        isResolved: topic.isResolved,
        createdAt: topic.createdAt.toISOString(),
      },
      posts: topic.posts.map((post) => ({
        id: post.id,
        authorName: post.author.fullname || post.author.name || "Unknown",
        content: post.content,
        createdAt: post.createdAt.toISOString(),
      })),
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[POST /api/board/[id]/summary]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

