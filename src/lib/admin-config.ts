import { moduleIds, type ModuleId, type RolePermissionConfig } from "@/lib/permissions";

export const MODULE_TOGGLES_KEY = "system.modules.enabled";
export const USER_PERMISSION_OVERRIDE_PREFIX = "permissions.userOverride.";

export type UserPermissionOverrideMode = "merge" | "replace";

export interface UserPermissionOverrideSetting {
  mode: UserPermissionOverrideMode;
  grants: RolePermissionConfig | null;
  denies: RolePermissionConfig | null;
}

const PROTECTED_ALWAYS_ENABLED: ModuleId[] = ["home", "search", "help", "administration"];

export function getDefaultEnabledModules(): ModuleId[] {
  // Keep finance modules hidden by default until explicitly enabled.
  return moduleIds.filter((id) => !["products", "accounting", "ebank"].includes(id));
}

export function normalizeEnabledModules(input: unknown): ModuleId[] {
  const source = Array.isArray(input) ? input : [];
  const set = new Set<ModuleId>();

  for (const value of source) {
    if (typeof value !== "string") continue;
    if (moduleIds.includes(value as ModuleId)) set.add(value as ModuleId);
  }

  for (const moduleId of PROTECTED_ALWAYS_ENABLED) {
    set.add(moduleId);
  }

  return moduleIds.filter((id) => set.has(id));
}

export function parseEnabledModulesSetting(raw: string | null | undefined): ModuleId[] {
  if (!raw?.trim()) return getDefaultEnabledModules();
  try {
    const parsed = JSON.parse(raw);
    return normalizeEnabledModules(parsed);
  } catch {
    return getDefaultEnabledModules();
  }
}

export function parseRolePermissionConfig(input: unknown): RolePermissionConfig | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const config: RolePermissionConfig = {};

  for (const moduleId of moduleIds) {
    const actions = source[moduleId];
    if (!Array.isArray(actions)) continue;

    const filtered = actions.filter(
      (action): action is "read" | "write" | "manage" =>
        action === "read" || action === "write" || action === "manage"
    );
    if (filtered.length > 0) {
      config[moduleId] = filtered;
    }
  }

  return Object.keys(config).length > 0 ? config : null;
}

function normalizeOverrideMode(value: unknown): UserPermissionOverrideMode {
  return value === "merge" ? "merge" : "replace";
}

export function parseUserPermissionOverrideSetting(
  raw: string | null | undefined
): UserPermissionOverrideSetting | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as {
      mode?: unknown;
      grants?: unknown;
      denies?: unknown;
    };

    const grants = parseRolePermissionConfig(parsed.grants);
    const denies = parseRolePermissionConfig(parsed.denies);
    const mode = normalizeOverrideMode(parsed.mode);

    if (!grants && !denies) {
      // Backward compatibility for legacy payload {grants:{...}} without mode/denies.
      const legacyGrants = parseRolePermissionConfig((parsed as { grants?: unknown }).grants);
      if (!legacyGrants) return null;
      return { mode: "replace", grants: legacyGrants, denies: null };
    }

    return { mode, grants, denies };
  } catch {
    return null;
  }
}

export function toUserPermissionOverrideSetting(
  value:
    | RolePermissionConfig
    | UserPermissionOverrideSetting
    | null
) {
  if (!value) {
    return JSON.stringify({
      mode: "replace",
      grants: {},
      denies: {},
    });
  }

  if (typeof value === "object" && "mode" in value) {
    const setting = value as UserPermissionOverrideSetting;
    return JSON.stringify({
      mode: normalizeOverrideMode(setting.mode),
      grants: setting.grants ?? {},
      denies: setting.denies ?? {},
    });
  }

  return JSON.stringify({
    mode: "replace",
    grants: (value as RolePermissionConfig) ?? {},
    denies: {},
  });
}
