import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import {
  applyRolePermissions,
  canAccess,
  createEmptyPermissionSet,
  grantAllPermissions,
  listAccessibleModules,
  moduleIds,
  normalizeRoleKey,
  parseRolePermissionsFromDescription,
  revokeRolePermissions,
  roleTemplateMap,
  type ModuleId,
  type ModulePermissionSet,
  type PermissionAction,
  type RolePermissionConfig,
} from "@/lib/permissions";
import {
  MODULE_TOGGLES_KEY,
  USER_PERMISSION_OVERRIDE_PREFIX,
  parseEnabledModulesSetting,
  parseUserPermissionOverrideSetting,
} from "@/lib/admin-config";

export interface EffectiveRole {
  groupId: string;
  name: string;
  color: string;
  membershipRole: string;
  templateKey: string;
  templateApplied: boolean;
  customPermissions: RolePermissionConfig | null;
}

export interface UserAccess {
  userId: string;
  isAdmin: boolean;
  permissions: ModulePermissionSet;
  roles: EffectiveRole[];
  accessibleModules: ModuleId[];
}

export async function buildUserAccess(userId: string, db?: PrismaClient): Promise<UserAccess | null> {
  const actualDb = db ?? prisma;
  const [user, settings] = await Promise.all([
    actualDb.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isAdmin: true,
        groupMembers: {
          include: {
            group: {
              select: { id: true, name: true, color: true, description: true },
            },
          },
        },
      },
    }),
    actualDb.systemSetting.findMany({
      where: {
        key: {
          in: [MODULE_TOGGLES_KEY, `${USER_PERMISSION_OVERRIDE_PREFIX}${userId}`],
        },
      },
      select: { key: true, value: true },
    }),
  ]);

  if (!user) return null;

  const settingsMap = new Map(settings.map((entry) => [entry.key, entry.value]));
  const enabledModules = parseEnabledModulesSetting(settingsMap.get(MODULE_TOGGLES_KEY));
  const userOverride = parseUserPermissionOverrideSetting(
    settingsMap.get(`${USER_PERMISSION_OVERRIDE_PREFIX}${userId}`)
  );

  const permissions = createEmptyPermissionSet();
  const roles: EffectiveRole[] = [];

  // Baseline access for authenticated users.
  applyRolePermissions(permissions, {
    home: ["read"],
    search: ["read"],
  });

  if (user.isAdmin) {
    grantAllPermissions(permissions);
  }

  for (const membership of user.groupMembers) {
    const templateKey = normalizeRoleKey(membership.group.name);
    const template = roleTemplateMap.get(templateKey);
    const customPermissions = parseRolePermissionsFromDescription(
      membership.group.description
    );

    if (template) {
      applyRolePermissions(permissions, template.permissions);
    }
    if (customPermissions) {
      applyRolePermissions(permissions, customPermissions);
    }

    roles.push({
      groupId: membership.group.id,
      name: membership.group.name,
      color: membership.group.color,
      membershipRole: membership.role,
      templateKey,
      templateApplied: Boolean(template),
      customPermissions,
    });
  }

  // Apply explicit per-user override policy.
  if (userOverride) {
    if (userOverride.mode === "replace") {
      for (const moduleId of moduleIds) {
        permissions[moduleId] = { read: false, write: false, manage: false };
      }
    }

    if (userOverride.grants) {
      applyRolePermissions(permissions, userOverride.grants);
    }

    if (userOverride.denies) {
      revokeRolePermissions(permissions, userOverride.denies);
    }
  }

  // Enforce global module toggles (admins bypass — they can always access all modules).
  if (!user.isAdmin) {
    const disabledConfig: RolePermissionConfig = {};
    for (const moduleId of Object.keys(permissions) as ModuleId[]) {
      if (!enabledModules.includes(moduleId)) {
        disabledConfig[moduleId] = ["read"];
      }
    }
    revokeRolePermissions(permissions, disabledConfig);
  }

  return {
    userId: user.id,
    isAdmin: user.isAdmin,
    permissions,
    roles,
    accessibleModules: listAccessibleModules(permissions, "read"),
  };
}

export function assertModuleAccess(
  access: UserAccess,
  moduleId: ModuleId,
  action: PermissionAction
) {
  return canAccess(access.permissions, moduleId, action);
}
