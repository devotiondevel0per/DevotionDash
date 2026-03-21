import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("board", "manage");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  try {
    const category = await prisma.boardCategory.findUnique({
      where: { id },
      include: { _count: { select: { topics: true } } },
    });

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    if (category._count.topics > 0) {
      return NextResponse.json(
        { error: "Category has topics. Remove all topics first." },
        { status: 409 }
      );
    }

    await prisma.boardCategory.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/board/categories/[id]]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

