import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const accessResult = await requireModuleAccess("telephony", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const where = accessResult.ctx.access.isAdmin ? {} : { userId: accessResult.ctx.userId };
    const extensions = await accessResult.ctx.db.extension.findMany({
      where,
      orderBy: { number: "asc" },
      select: {
        id: true,
        userId: true,
        number: true,
        isActive: true,
        createdAt: true,
      },
    });

    const userIds = [...new Set(extensions.map((ext) => ext.userId).filter(Boolean) as string[])];
    const users = userIds.length
      ? await accessResult.ctx.db.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            name: true,
            fullname: true,
            login: true,
            email: true,
          },
        })
      : [];
    const userById = new Map(users.map((user) => [user.id, user] as const));

    return NextResponse.json(
      extensions.map((ext) => ({
        ...ext,
        user: ext.userId ? userById.get(ext.userId) ?? null : null,
      }))
    );
  } catch (error) {
    console.error("[GET /api/telephony/extensions]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const r = await requireModuleAccess("telephony", "manage");
  if (!r.ok) return r.response;
  const body = (await req.json()) as { number: string; userId?: string; password?: string; isActive?: boolean };
  if (!body.number?.trim()) {
    return NextResponse.json({ error: "number is required" }, { status: 400 });
  }
  const ext = await r.ctx.db.extension.create({
    data: {
      number: body.number.trim(),
      userId: body.userId ?? null,
      password: body.password?.trim() || randomUUID().replace(/-/g, ""),
      isActive: body.isActive ?? true,
    },
  });
  return NextResponse.json(ext, { status: 201 });
}

