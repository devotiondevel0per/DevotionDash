import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("products", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const isActiveParam = searchParams.get("isActive");
    const search = searchParams.get("search");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);

    const where: Record<string, unknown> = {};
    if (categoryId) where.categoryId = categoryId;
    if (isActiveParam === "true") where.isActive = true;
    if (isActiveParam === "false") where.isActive = false;
    if (search) {
      where.OR = [{ name: { contains: search } }, { sku: { contains: search } }];
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error("[GET /api/products]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("products", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const { name, categoryId, description, price, currency, sku, stock, isActive } = body as {
      name?: string;
      categoryId?: string;
      description?: string;
      price?: number;
      currency?: string;
      sku?: string;
      stock?: number;
      isActive?: boolean;
    };

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const created = await prisma.product.create({
      data: {
        name: name.trim(),
        categoryId: categoryId ?? null,
        description: description ?? null,
        price: price ?? 0,
        currency: currency ?? "USD",
        sku: sku ?? null,
        stock: stock ?? 0,
        isActive: isActive ?? true,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[POST /api/products]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

