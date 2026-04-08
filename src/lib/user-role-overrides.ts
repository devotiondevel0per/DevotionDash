import type { PrismaClient } from "@prisma/client";
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

type RoleGroupRecord = {
  name: string;
  description: string | null;
};

function buildMergedRoleGrants(roleGroups: RoleGroupRecord[]): RolePermissionConfig | null {
  if (roleGroups.length === 0) return null;

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
    const current = merged[moduleId as ModuleId];
    const actions: PermissionAction[] = [];
    if (current.read) actions.push("read");
    if (current.write) actions.push("write");
    if (current.manage) actions.push("manage");
    if (actions.length > 0) grants[moduleId as ModuleId] = actions;
  }

  return Object.keys(grants).length > 0 ? grants : null;
}

export async function syncUserRolePermissionOverride(
  db: PrismaClient,
  userId: string,
  explicitGroupIds?: string[]
) {
  const key = `${USER_PERMISSION_OVERRIDE_PREFIX}${userId}`;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, isAdmin: true },
  });
  if (!user) return;

  if (user.isAdmin) {
    await db.systemSetting.deleteMany({ where: { key } });
    return;
  }

  let groupIds = explicitGroupIds;
  if (!groupIds) {
    const memberships = await db.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    groupIds = memberships.map((entry) => entry.groupId);
  }

  const uniqueGroupIds = Array.from(new Set((groupIds ?? []).filter(Boolean)));
  if (uniqueGroupIds.length === 0) {
    await db.systemSetting.deleteMany({ where: { key } });
    return;
  }

  const roleGroups = await db.group.findMany({
    where: { id: { in: uniqueGroupIds } },
    select: { name: true, description: true },
  });
  const grants = buildMergedRoleGrants(roleGroups);
  if (!grants) {
    await db.systemSetting.deleteMany({ where: { key } });
    return;
  }

  await db.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value: toUserPermissionOverrideSetting({
        mode: "replace",
        grants,
        denies: null,
      }),
    },
    update: {
      value: toUserPermissionOverrideSetting({
        mode: "replace",
        grants,
        denies: null,
      }),
    },
  });
}

export async function syncUsersRolePermissionOverrides(db: PrismaClient, userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  for (const userId of uniqueUserIds) {
    await syncUserRolePermissionOverride(db, userId);
  }
}
