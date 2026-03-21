import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { buildUserAccess } from "@/lib/rbac";

function displayName(user: { name: string; fullname: string; surname: string }) {
  return user.fullname || [user.name, user.surname].filter(Boolean).join(" ").trim() || "Unknown";
}

export async function GET() {
  const accessResult = await requireModuleAccess("livechat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const [users, assignments] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true },
        orderBy: [{ fullname: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          fullname: true,
          surname: true,
          email: true,
          isActive: true,
          workState: true,
          lastActivity: true,
        },
      }),
      prisma.chatDialogMember.findMany({
        where: { dialog: { isExternal: true, status: "open" } },
        select: { userId: true },
      }),
    ]);

    const loadByUserId = assignments.reduce((acc, row) => {
      acc.set(row.userId, (acc.get(row.userId) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());

    const accessRows = await Promise.all(
      users.map(async (user) => ({
        user,
        access: await buildUserAccess(user.id),
      }))
    );

    const items = accessRows
      .filter((row) => Boolean(row.access?.permissions.livechat.read))
      .map((row) => ({
        id: row.user.id,
        name: displayName(row.user),
        email: row.user.email,
        isActive: row.user.isActive,
        workState: row.user.workState,
        lastActivity: row.user.lastActivity?.toISOString() ?? null,
        hasWrite: Boolean(row.access?.permissions.livechat.write || row.access?.permissions.livechat.manage),
        hasManage: Boolean(row.access?.permissions.livechat.manage),
        openLoad: loadByUserId.get(row.user.id) ?? 0,
      }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[GET /api/livechat/agents]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
