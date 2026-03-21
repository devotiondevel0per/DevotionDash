import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const accessResult = await requireModuleAccess("products", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const categories = await prisma.productCategory.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { products: true } },
      },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error("[GET /api/products/categories]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

