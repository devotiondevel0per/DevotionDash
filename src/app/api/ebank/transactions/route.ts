import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("ebank", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "300", 10), 600);

    const where: Record<string, unknown> = {};
    if (accountId) where.accountId = accountId;
    if (status) where.status = status;
    if (search) where.description = { contains: search };

    const transactions = await prisma.bankTransaction.findMany({
      where,
      orderBy: { transactionAt: "desc" },
      take: limit,
      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountNumber: true,
            bankName: true,
            currency: true,
          },
        },
      },
    });

    return NextResponse.json(transactions);
  } catch (error) {
    console.error("[GET /api/ebank/transactions]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("ebank", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const { accountId, type, amount, currency, description, reference, status } = body as {
      accountId?: string;
      type?: string;
      amount?: number;
      currency?: string;
      description?: string;
      reference?: string;
      status?: string;
    };

    if (!accountId || amount === undefined) {
      return NextResponse.json({ error: "accountId and amount are required" }, { status: 400 });
    }

    const tx = await prisma.bankTransaction.create({
      data: {
        accountId,
        type: type ?? "credit",
        amount,
        currency: currency ?? "USD",
        description: description ?? null,
        reference: reference ?? null,
        status: status ?? "recognized",
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountNumber: true,
            bankName: true,
            currency: true,
          },
        },
      },
    });

    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    console.error("[POST /api/ebank/transactions]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

