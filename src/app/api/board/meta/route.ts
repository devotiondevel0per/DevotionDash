import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const accessResult = await requireModuleAccess("board", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const [organizations] = await Promise.all([
      prisma.organization.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
        },
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
        take: 120,
      }),
    ]);

    const teams = accessResult.ctx.access.roles.map((role) => ({
      id: role.groupId,
      name: role.name,
      color: role.color,
    }));

    return NextResponse.json({
      teams,
      organizations,
      visibilityOptions: [
        { value: "organization", label: "Organization" },
        { value: "team", label: "Team Only" },
        { value: "private", label: "Private" },
        { value: "public", label: "Public" },
      ],
    });
  } catch (error) {
    console.error("[GET /api/board/meta]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

