import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("accounting", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) where.name = { contains: search };

    const books = await prisma.accountingBook.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { contracts: true } },
      },
    });

    return NextResponse.json(books);
  } catch (error) {
    console.error("[GET /api/accounting/books]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("accounting", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const { name, description, currency, organizationId } = body as {
      name?: string;
      description?: string;
      currency?: string;
      organizationId?: string;
    };

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const created = await prisma.accountingBook.create({
      data: {
        name: name.trim(),
        description: description ?? null,
        currency: currency ?? "USD",
        organizationId: organizationId ?? null,
      },
      include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { contracts: true } },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[POST /api/accounting/books]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

