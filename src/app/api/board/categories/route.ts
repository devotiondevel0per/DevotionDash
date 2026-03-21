import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const accessResult = await requireModuleAccess("board", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const categories = await prisma.boardCategory.findMany({
      select: {
        id: true,
        name: true,
        color: true,
        description: true,
        createdAt: true,
        _count: { select: { topics: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error("[GET /api/board/categories]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("board", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const { name, color, description } = body as {
      name?: string;
      color?: string;
      description?: string;
    };

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const normalizedName = name.trim();
    const existing = await prisma.boardCategory.findFirst({
      where: { name: normalizedName },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "Category already exists" }, { status: 409 });
    }

    let safeColor = "#FE0000";
    if (typeof color === "string" && color.trim()) {
      const candidate = color.trim();
      if (!/^#([0-9a-fA-F]{6})$/.test(candidate)) {
        return NextResponse.json(
          { error: "color must be a hex value like #FE0000" },
          { status: 400 }
        );
      }
      safeColor = candidate.toUpperCase();
    }

    const category = await prisma.boardCategory.create({
      data: {
        name: normalizedName,
        color: safeColor,
        description:
          typeof description === "string" && description.trim()
            ? description.trim()
            : null,
      },
      select: {
        id: true,
        name: true,
        color: true,
        description: true,
        createdAt: true,
        _count: { select: { topics: true } },
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("[POST /api/board/categories]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
