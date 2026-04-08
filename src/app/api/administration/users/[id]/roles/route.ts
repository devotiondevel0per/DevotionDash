import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { buildUserAccess } from "@/lib/rbac";
import { writeAuditLog, getClientIpAddress } from "@/lib/audit-log";
import { syncUserRolePermissionOverride } from "@/lib/user-role-overrides";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: userId } = await params;
    const body = await req.json();
    const { groupIds, membershipRole } = body as {
      groupIds?: string[];
      membershipRole?: string;
    };

    if (!Array.isArray(groupIds)) {
      return NextResponse.json({ error: "groupIds must be an array" }, { status: 400 });
    }

    const uniqueGroupIds = Array.from(new Set(groupIds.filter(Boolean)));

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (uniqueGroupIds.length > 0) {
      const validGroups = await prisma.group.findMany({
        where: { id: { in: uniqueGroupIds } },
        select: { id: true },
      });
      const validGroupIdSet = new Set(validGroups.map((group) => group.id));
      const invalid = uniqueGroupIds.filter((groupId) => !validGroupIdSet.has(groupId));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Invalid groupIds: ${invalid.join(", ")}` },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.groupMember.deleteMany({ where: { userId } });

      if (uniqueGroupIds.length > 0) {
        await tx.groupMember.createMany({
          data: uniqueGroupIds.map((groupId) => ({
            groupId,
            userId,
            role: membershipRole?.trim() || "member",
          })),
        });
      }
    });

    await syncUserRolePermissionOverride(prisma, userId, uniqueGroupIds);

    const updatedAccess = await buildUserAccess(userId);

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "USER_ROLES_UPDATED",
      module: "administration",
      targetId: userId,
      details: JSON.stringify({
        groupIds: uniqueGroupIds,
        membershipRole: membershipRole?.trim() || "member",
      }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({
      success: true,
      userId,
      roles: updatedAccess?.roles ?? [],
      accessibleModules: updatedAccess?.accessibleModules ?? [],
      permissions: updatedAccess?.permissions ?? null,
    });
  } catch (error) {
    console.error("[PUT /api/administration/users/[id]/roles]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
