import type { ModuleId } from "@/lib/permissions";

const MODULE_LINK_PREFIXES: Array<{ moduleId: ModuleId; prefix: string }> = [
  { moduleId: "home", prefix: "/home" },
  { moduleId: "tasks", prefix: "/tasks" },
  { moduleId: "projects", prefix: "/projects" },
  { moduleId: "documents", prefix: "/documents" },
  { moduleId: "email", prefix: "/email" },
  { moduleId: "board", prefix: "/board" },
  { moduleId: "leads", prefix: "/leads" },
  { moduleId: "clients", prefix: "/clients" },
  { moduleId: "contacts", prefix: "/contacts" },
  { moduleId: "team", prefix: "/team" },
  { moduleId: "calendar", prefix: "/calendar" },
  { moduleId: "chat", prefix: "/chat" },
  { moduleId: "livechat", prefix: "/livechat" },
  { moduleId: "servicedesk", prefix: "/servicedesk" },
  { moduleId: "products", prefix: "/products" },
  { moduleId: "accounting", prefix: "/accounting" },
  { moduleId: "ebank", prefix: "/ebank" },
  { moduleId: "telephony", prefix: "/telephony" },
  { moduleId: "search", prefix: "/search" },
  { moduleId: "help", prefix: "/help" },
  { moduleId: "administration", prefix: "/administration" },
];

export function inferModuleFromNotificationLink(link: string | null | undefined): ModuleId | null {
  const value = link?.trim();
  if (!value) return null;

  // Restrict to internal links only.
  if (!value.startsWith("/")) return null;

  for (const entry of MODULE_LINK_PREFIXES) {
    if (value === entry.prefix || value.startsWith(`${entry.prefix}/`) || value.startsWith(`${entry.prefix}?`)) {
      return entry.moduleId;
    }
  }

  return null;
}

export function canAccessNotificationLink(
  link: string | null | undefined,
  accessibleModules: Iterable<ModuleId>
) {
  const moduleId = inferModuleFromNotificationLink(link);
  if (!moduleId) return false;
  const set = accessibleModules instanceof Set ? accessibleModules : new Set(accessibleModules);
  return set.has(moduleId);
}
