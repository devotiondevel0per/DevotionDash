import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { buildUserAccess } from "@/lib/rbac";
import { writeAuditLog, getClientIpAddress } from "@/lib/audit-log";
import {
  USER_PERMISSION_OVERRIDE_PREFIX,
  toUserPermissionOverrideSetting,
} from "@/lib/admin-config";
import {
  applyRolePermissions,
  createEmptyPermissionSet,
  moduleIds,
  normalizeRoleKey,
  parseRolePermissionsFromDescription,
  roleTemplateMap,
  type ModuleId,
  type PermissionAction,
  type RolePermissionConfig,
} from "@/lib/permissions";

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

    // Recompute and save merged role permissions as user override
    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
    if (!targetUser?.isAdmin && uniqueGroupIds.length > 0) {
      const roleGroups = await prisma.group.findMany({
        where: { id: { in: uniqueGroupIds } },
        select: { name: true, description: true },
      });
      const merged = createEmptyPermissionSet();
      for (const group of roleGroups) {
        const templateKey = normalizeRoleKey(group.name);
        const template = roleTemplateMap.get(templateKey);
        if (template) applyRolePermissions(merged, template.permissions);
        const custom = parseRolePermissionsFromDescription(group.description);
        if (custom) applyRolePermissions(merged, custom);
      }
      const grants: RolePermissionConfig = {};
      for (const moduleId of moduleIds) {
        const m = merged[moduleId as ModuleId];
        const actions: PermissionAction[] = [];
        if (m.read) actions.push("read");
        if (m.write) actions.push("write");
        if (m.manage) actions.push("manage");
        if (actions.length > 0) grants[moduleId as ModuleId] = actions;
      }
      const key = `${USER_PERMISSION_OVERRIDE_PREFIX}${userId}`;
      if (Object.keys(grants).length > 0) {
        await prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: toUserPermissionOverrideSetting({ mode: "replace", grants, denies: null }) },
          update: { value: toUserPermissionOverrideSetting({ mode: "replace", grants, denies: null }) },
        });
      } else {
        await prisma.systemSetting.deleteMany({ where: { key } });
      }
    }

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
