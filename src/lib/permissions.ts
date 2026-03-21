export const moduleIds = [
  "home",
  "tasks",
  "projects",
  "documents",
  "email",
  "board",
  "leads",
  "clients",
  "contacts",
  "team",
  "calendar",
  "chat",
  "livechat",
  "servicedesk",
  "products",
  "accounting",
  "ebank",
  "telephony",
  "search",
  "administration",
] as const;

export type ModuleId = (typeof moduleIds)[number];
export type PermissionAction = "read" | "write" | "manage";

export type ModulePermissionSet = Record<
  ModuleId,
  {
    read: boolean;
    write: boolean;
    manage: boolean;
  }
>;

export type RolePermissionConfig = Partial<Record<ModuleId, PermissionAction[]>>;

export interface RoleTemplate {
  key: string;
  label: string;
  description: string;
  color: string;
  permissions: RolePermissionConfig;
}

export const roleTemplates: RoleTemplate[] = [
  {
    key: "viewer",
    label: "Viewer",
    description: "Read-only access to core collaboration modules.",
    color: "#3B4A61",
    permissions: {
      home: ["read"],
      tasks: ["read"],
      projects: ["read"],
      documents: ["read"],
      email: ["read"],
      board: ["read"],
      leads: ["read"],
      clients: ["read"],
      contacts: ["read"],
      team: ["read"],
      calendar: ["read"],
      chat: ["read"],
      livechat: ["read"],
      servicedesk: ["read"],
      products: ["read"],
      accounting: ["read"],
      ebank: ["read"],
      telephony: ["read"],
      search: ["read"],
    },
  },
  {
    key: "employee",
    label: "Employee",
    description: "Day-to-day work permissions in collaboration modules.",
    color: "#437388",
    permissions: {
      home: ["read"],
      tasks: ["read", "write"],
      projects: ["read", "write"],
      documents: ["read", "write"],
      email: ["read", "write"],
      board: ["read", "write"],
      leads: ["read", "write"],
      clients: ["read"],
      contacts: ["read"],
      team: ["read"],
      calendar: ["read", "write"],
      chat: ["read", "write"],
      livechat: ["read", "write"],
      servicedesk: ["read", "write"],
      search: ["read"],
    },
  },
  {
    key: "crm_manager",
    label: "CRM Manager",
    description: "Full CRM and service desk management.",
    color: "#5EAD63",
    permissions: {
      home: ["read"],
      leads: ["read", "write", "manage"],
      clients: ["read", "write", "manage"],
      contacts: ["read", "write", "manage"],
      livechat: ["read", "write", "manage"],
      servicedesk: ["read", "write", "manage"],
      email: ["read", "write"],
      chat: ["read", "write"],
      search: ["read"],
    },
  },
  {
    key: "finance_manager",
    label: "Finance Manager",
    description: "Accounting, banking, and product catalog management.",
    color: "#818B4B",
    permissions: {
      home: ["read"],
      products: ["read", "write", "manage"],
      accounting: ["read", "write", "manage"],
      ebank: ["read", "write", "manage"],
      documents: ["read", "write"],
      search: ["read"],
    },
  },
  {
    key: "it_admin",
    label: "IT Admin",
    description: "System operations and administration controls.",
    color: "#D15600",
    permissions: {
      home: ["read"],
      administration: ["read", "write", "manage"],
      telephony: ["read", "write", "manage"],
      team: ["read", "write"],
      board: ["read", "write", "manage"],
      livechat: ["read", "write", "manage"],
      search: ["read"],
    },
  },
];

export const roleTemplateMap = new Map(roleTemplates.map((role) => [role.key, role]));

export function normalizeRoleKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function createEmptyPermissionSet(): ModulePermissionSet {
  return moduleIds.reduce((acc, moduleId) => {
    acc[moduleId] = { read: false, write: false, manage: false };
    return acc;
  }, {} as ModulePermissionSet);
}

export function applyRolePermissions(
  target: ModulePermissionSet,
  config?: RolePermissionConfig | null
) {
  if (!config) return target;

  for (const moduleId of moduleIds) {
    const actions = config[moduleId];
    if (!actions || actions.length === 0) continue;

    const next = target[moduleId];
    if (actions.includes("read")) next.read = true;
    if (actions.includes("write")) {
      next.read = true;
      next.write = true;
    }
    if (actions.includes("manage")) {
      next.read = true;
      next.write = true;
      next.manage = true;
    }
  }

  return target;
}

export function revokeRolePermissions(
  target: ModulePermissionSet,
  config?: RolePermissionConfig | null
) {
  if (!config) return target;

  for (const moduleId of moduleIds) {
    const actions = config[moduleId];
    if (!actions || actions.length === 0) continue;

    const next = target[moduleId];
    if (actions.includes("read")) {
      next.read = false;
      next.write = false;
      next.manage = false;
      continue;
    }
    if (actions.includes("write")) {
      next.write = false;
      next.manage = false;
    }
    if (actions.includes("manage")) {
      next.manage = false;
    }
  }

  return target;
}

export function grantAllPermissions(target: ModulePermissionSet) {
  for (const moduleId of moduleIds) {
    target[moduleId].read = true;
    target[moduleId].write = true;
    target[moduleId].manage = true;
  }
  return target;
}

export function canAccess(
  permissions: ModulePermissionSet,
  moduleId: ModuleId,
  action: PermissionAction
) {
  return permissions[moduleId][action];
}

export function listAccessibleModules(
  permissions: ModulePermissionSet,
  action: PermissionAction = "read"
) {
  return moduleIds.filter((moduleId) => permissions[moduleId][action]);
}

export function parseRolePermissionsFromDescription(
  description?: string | null
): RolePermissionConfig | null {
  if (!description || !description.trim()) return null;

  try {
    const parsed = JSON.parse(description) as {
      permissions?: Record<string, PermissionAction[]>;
    };
    if (!parsed.permissions || typeof parsed.permissions !== "object") return null;

    const config: RolePermissionConfig = {};
    for (const moduleId of moduleIds) {
      const actions = parsed.permissions[moduleId];
      if (!Array.isArray(actions)) continue;

      const allowed = actions.filter(
        (action): action is PermissionAction =>
          action === "read" || action === "write" || action === "manage"
      );
      if (allowed.length) config[moduleId] = allowed;
    }

    return Object.keys(config).length ? config : null;
  } catch {
    return null;
  }
}

export function toRoleDescriptionJson(permissions: RolePermissionConfig) {
  return JSON.stringify({ permissions });
}
