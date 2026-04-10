import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

function normalizeFieldKey(input: string | null): string {
  const raw = (input ?? "").trim().toLowerCase();
  return raw.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const fieldKey = normalizeFieldKey(searchParams.get("fieldKey"));
    if (!fieldKey) {
      return NextResponse.json({ error: "fieldKey is required" }, { status: 400 });
    }

    const jsonPath = `$.${fieldKey}`;
    const rows = await prisma.$queryRaw<Array<{ total: bigint | number }>>(
      Prisma.sql`
        SELECT COUNT(*) AS total
        FROM projects
        WHERE JSON_EXTRACT(customData, ${jsonPath}) IS NOT NULL
      `
    );

    const rawCount = rows[0]?.total ?? 0;
    const count = typeof rawCount === "bigint" ? Number(rawCount) : Number(rawCount || 0);
    return NextResponse.json({ fieldKey, count });
  } catch (error) {
    console.error("[GET /api/administration/project-form-config/impact]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
