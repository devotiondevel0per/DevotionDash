import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("documents", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") ?? "").trim();
    const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        ...(search
          ? {
              OR: [
                { fullname: { contains: search } },
                { name: { contains: search } },
                { email: { contains: search } },
                { login: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: [{ fullname: "asc" }, { name: "asc" }],
      take: limit,
      select: {
        id: true,
        name: true,
        fullname: true,
        email: true,
      },
    });

    return NextResponse.json(users.map((user) => ({
      id: user.id,
      name: user.fullname || user.name,
      email: user.email,
    })));
  } catch (error) {
    console.error("[GET /api/documents/share-users]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
