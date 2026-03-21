import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessResult = await requireModuleAccess("accounting", "read");
  if (!accessResult.ok) return accessResult.response;
  const { id } = await params;
  try {
    const contracts = await prisma.accountingContract.findMany({
      where: { bookId: id },
      include: { transactions: { orderBy: { date: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(contracts);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessResult = await requireModuleAccess("accounting", "write");
  if (!accessResult.ok) return accessResult.response;
  const { id } = await params;
  try {
    const body = await req.json();
    const contract = await prisma.accountingContract.create({
      data: {
        bookId: id,
        number: body.number,
        description: body.description,
        amount: body.amount,
        currency: body.currency ?? "USD",
        status: body.status ?? "active",
        signedAt: body.signedAt ? new Date(body.signedAt) : null,
      },
    });
    return NextResponse.json(contract, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
