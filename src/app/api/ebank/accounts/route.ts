import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const accessResult = await requireModuleAccess("ebank", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const accounts = await prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        accountNumber: true,
        bankName: true,
        currency: true,
        provider: true,
        balance: true,
        createdAt: true,
        _count: { select: { transactions: true } },
      },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    console.error("[GET /api/ebank/accounts]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("ebank", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const {
      name,
      accountNumber,
      bankName,
      currency,
      provider,
      balance,
      isActive,
    } = body as {
      name?: string;
      accountNumber?: string;
      bankName?: string;
      currency?: string;
      provider?: string;
      balance?: number;
      isActive?: boolean;
    };

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!accountNumber || !accountNumber.trim()) {
      return NextResponse.json({ error: "accountNumber is required" }, { status: 400 });
    }
    if (!bankName || !bankName.trim()) {
      return NextResponse.json({ error: "bankName is required" }, { status: 400 });
    }

    const created = await prisma.bankAccount.create({
      data: {
        name: name.trim(),
        accountNumber: accountNumber.trim(),
        bankName: bankName.trim(),
        currency: currency?.trim() || "USD",
        provider: provider?.trim() || "manual",
        balance: balance ?? 0,
        isActive: isActive ?? true,
      },
      select: {
        id: true,
        name: true,
        accountNumber: true,
        bankName: true,
        currency: true,
        provider: true,
        balance: true,
        createdAt: true,
        _count: { select: { transactions: true } },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[POST /api/ebank/accounts]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
