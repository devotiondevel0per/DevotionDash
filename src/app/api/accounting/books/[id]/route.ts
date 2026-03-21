import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessResult = await requireModuleAccess("accounting", "read");
  if (!accessResult.ok) return accessResult.response;
  const { id } = await params;
  try {
    const book = await prisma.accountingBook.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true } },
        contracts: {
          include: { _count: { select: { transactions: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(book);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessResult = await requireModuleAccess("accounting", "write");
  if (!accessResult.ok) return accessResult.response;
  const { id } = await params;
  try {
    const { name, description, status } = await req.json();
    const book = await prisma.accountingBook.update({ where: { id }, data: { name, description, status } });
    return NextResponse.json(book);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
