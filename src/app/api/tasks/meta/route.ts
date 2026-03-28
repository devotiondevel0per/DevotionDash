import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;
    const groupIds = accessResult.ctx.access.roles.map((role) => role.groupId);

    const userWhere = accessResult.ctx.access.isAdmin
      ? { isActive: true }
      : groupIds.length > 0
        ? {
            OR: [
              { id: userId },
              {
                groupMembers: {
                  some: {
                    groupId: { in: groupIds },
                  },
                },
              },
            ],
            isActive: true,
          }
        : { id: userId, isActive: true };

    const users = await prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        surname: true,
        fullname: true,
        email: true,
        department: true,
        groupMembers: {
          select: {
            group: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
      orderBy: [{ fullname: "asc" }, { name: "asc" }],
      take: 500,
    });

    const groupMap = new Map<string, { id: string; name: string; color: string }>();
    for (const user of users) {
      for (const membership of user.groupMembers) {
        if (!membership.group?.id) continue;
        groupMap.set(membership.group.id, {
          id: membership.group.id,
          name: membership.group.name,
          color: membership.group.color,
        });
      }
    }
    const groups = Array.from(groupMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      users: users.map((user) => ({
        id: user.id,
        fullname: user.fullname || `${user.name} ${user.surname}`.trim(),
        email: user.email,
        department: user.department,
        groupIds: user.groupMembers.map((membership) => membership.group.id),
      })),
      groups,
      currentUserId: userId,
    });
  } catch (error) {
    console.error("[GET /api/tasks/meta]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
