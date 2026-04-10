"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { moduleIds, type ModuleId, type PermissionAction, type RolePermissionConfig } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { BarChart3, Blocks, Building2, ClipboardList, Copy, Eye, EyeOff, FileClock, GitBranch, Globe, KeyRound, LayoutDashboard, Loader2, Lock, Mail, MessageSquare, Palette, Pencil, Phone, Plus, RefreshCw, Save, Server, Shield, Sparkles, TicketCheck, Trash2, UserCheck, UserPlus, Users } from "lucide-react";
import { DEFAULT_SECURITY_POLICY, parseListFromText, parseSecurityPolicy, serializeSecurityPolicy, type SecurityPolicy } from "@/lib/security-policy";
import { BRANDING_UPDATED_EVENT, DEFAULT_APP_NAME, DEFAULT_APP_TAGLINE, RUNTIME_SETTINGS_STORAGE_KEY } from "@/lib/branding";
import { ProjectFormBuilder } from "@/components/administration/project-form-builder";
import { toast } from "sonner";

type RoleSummary = { id: string; name: string; color: string; memberCount: number; permissions: RolePermissionConfig | null };
type AdminUser = {
  id: string;
  login: string;
  email: string;
  name: string;
  surname: string;
  fullname: string;
  position: string;
  department: string;
  isAdmin: boolean;
  isActive: boolean;
  workState: number;
  lastActivity?: string | null;
  createdAt?: string;
  roles: Array<{ id: string; name: string; color: string }>;
  accessibleModules: string[];
};
type NewUserForm = {
  login: string;
  email: string;
  password: string;
  name: string;
  surname: string;
  fullname: string;
  position: string;
  department: string;
  isAdmin: boolean;
  isActive: boolean;
  roleIds: string[];
};
type PermissionResponse = { isAdmin: boolean; permissions: Record<string, { read: boolean; write: boolean; manage: boolean }>; accessibleModules: string[] };
type SettingsForm = {
  appName: string;
  appTagline: string;
  supportEmail: string;
  defaultTimezone: string;
  themePrimary: string;
  sidebarFrom: string;
  sidebarMid: string;
  sidebarTo: string;
  topbarFrom: string;
  topbarMid: string;
  topbarTo: string;
  topbarAccent: string;
  aiModel: string;
  conversationAuthorEditDeleteWindowMinutes: number;
};
type ModuleToggle = { id: ModuleId; enabled: boolean; locked: boolean };
type AuditLogItem = { id: string; action: string; module: string; details?: string | null; createdAt: string; user: { name: string } | null };
type AdminInsight = { summary: string; highlights: string[]; risks: string[]; actions: string[]; generatedAt: string; fallback: boolean };
type ReportModule = { moduleId: string; label: string; total: number; recent: number; backlog: number; trend: "up" | "flat" | "down" };
type ReportEmployee = { userId: string; name: string; email: string; department: string; roles: string[]; isActive: boolean; lastActivity: string | null; tasksAssigned: number; tasksCompleted: number; tasksOverdue: number; ticketsAssigned: number; ticketsClosed: number; emailsSent: number; activityScore: number };
type ReportInsight = { summary: string; highlights: string[]; risks: string[]; actions: string[]; source: string; fallback: boolean };
type ReportPayload = {
  generatedAt: string;
  days: number;
  timezone: string;
  totals: { users: number; activeUsers: number; unreadEmails: number; openServiceRequests: number; sentEmails: number; auditEvents: number };
  modules: ReportModule[];
  employees: ReportEmployee[];
  insight: ReportInsight | null;
};
type AdminSection =
  | "overview"
  | "users"
  | "roles"
  | "settings"
  | "leadConfig"
  | "workflowConfig"
  | "modules"
  | "security"
  | "deployment"
  | "reports"
  | "logs"
  | "livechat"
  | "tenants"
  | "ticketwidgets"
  | "telephony";
type DepartmentItem = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
type SecurityForm = {
  ipAllowlistText: string;
  ipBlocklistText: string;
  countryAllowlistText: string;
  countryBlocklistText: string;
  rateMaxAttempts: number;
  rateWindowMinutes: number;
  rateLockMinutes: number;
  minPasswordLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  enforce2FAForAdmins: boolean;
  sessionMaxMinutes: number;
};
type UserTwoFactorView = {
  enabled: boolean;
  backupCodesRemaining: number;
  updatedAt: string | null;
  hasSecret: boolean;
};
type UserPermissionOverrideMode = "merge" | "replace";
type LeadConfigFieldId =
  | "title"
  | "companyName"
  | "contactName"
  | "email"
  | "phone"
  | "country"
  | "language"
  | "source"
  | "priority"
  | "notes";
type LeadConfigField = {
  id: LeadConfigFieldId;
  label: string;
  enabled: boolean;
  required: boolean;
  order: number;
  placeholder: string;
};
type LeadCustomFieldType = "text" | "textarea" | "number" | "checkbox" | "dropdown" | "date";
type LeadCustomField = {
  id: string;
  type: LeadCustomFieldType;
  label: string;
  enabled: boolean;
  required: boolean;
  order: number;
  placeholder: string;
  options: string[];
};
type LeadConfigResponse = {
  stageFlow: string[];
  sourceOptions: string[];
  formFields: LeadConfigField[];
  customFields: LeadCustomField[];
};
type WorkflowStage = {
  key: string;
  label: string;
  color: string;
  isClosed: boolean;
  isDefault: boolean;
  order: number;
};
type WorkflowConfig = {
  tasks: WorkflowStage[];
  servicedesk: WorkflowStage[];
  projectTasks: WorkflowStage[];
};
type EmailConfigForm = {
  imapHost: string;
  imapPort: number;
  imapSsl: boolean;
  imapLogin: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: number;
  smtpSsl: boolean;
  smtpLogin: string;
  smtpPassword: string;
  fromName: string;
  fromEmail: string;
  isEnabled: boolean;
};

type LiveChatAutomationForm = {
  autoAssignEnabled: boolean;
  routingStrategy: "least_loaded" | "round_robin";
  maxOpenPerAgent: number;
  translatorEnabled: boolean;
  translatorSourceLang: string;
  translatorTargetLang: string;
  aiInsightsEnabled: boolean;
  autoCloseEnabled: boolean;
  autoCloseMinutes: number;
};
type LiveChatWidgetRow = {
  id: string;
  name: string;
  domain: string | null;
  token: string;
  enabled: boolean;
  brandLabel: string;
  logoUrl: string | null;
  welcomeText: string;
  accentColor: string;
  position: string;
  allowDomains: string | null;
  createdAt: string;
};
type LiveChatWidgetForm = {
  name: string;
  domain: string;
  enabled: boolean;
  brandLabel: string;
  logoUrl: string;
  welcomeText: string;
  accentColor: string;
  position: "left" | "right";
  allowDomains: string;
};
const EMPTY_WIDGET_FORM: LiveChatWidgetForm = {
  name: "",
  domain: "",
  enabled: true,
  brandLabel: "Chat with us",
  logoUrl: "",
  welcomeText: "Hi! How can we help you today?",
  accentColor: "#AA8038",
  position: "right",
  allowDomains: "",
};

type TenantItem = {
  id: string; slug: string; name: string; status: string; plan: string;
  maxUsers: number; defaultDomain: string; customDomain: string | null;
  databaseUrl: string; adminEmail: string; trialEndsAt: string | null;
  brandName: string | null; notes: string | null; createdAt: string; updatedAt: string;
  subscription: {
    billingType: string; pricePerUser: string | null; flatPrice: string | null;
    currency: string; userLimit: number; nextBillingAt: string | null;
    lastBilledAt: string | null; status: string; notes: string | null;
  } | null;
};
type TenantForm = {
  slug: string; name: string; defaultDomain: string; customDomain: string;
  databaseUrl: string; adminEmail: string; plan: string; maxUsers: number;
  trialDays: number; notes: string; brandName: string;
  billingType: string; pricePerUser: string; flatPrice: string; currency: string;
};
const EMPTY_TENANT_FORM: TenantForm = {
  slug: "", name: "", defaultDomain: "", customDomain: "", databaseUrl: "",
  adminEmail: "", plan: "basic", maxUsers: 10, trialDays: 14, notes: "", brandName: "",
  billingType: "per_user_monthly", pricePerUser: "", flatPrice: "", currency: "USD",
};

type TicketWidgetItem = {
  id: string; name: string; token: string; enabled: boolean;
  brandLabel: string; welcomeText: string; accentColor: string;
  position: string; defaultGroupId: string | null; allowDomains: string | null;
  createdAt: string;
};
type TicketWidgetForm = {
  name: string;
  brandLabel: string;
  welcomeText: string;
  accentColor: string;
  position: string;
  defaultGroupId: string;
  allowDomains: string;
};
const EMPTY_TICKET_WIDGET_FORM: TicketWidgetForm = {
  name: "",
  brandLabel: "Support",
  welcomeText: "Hi! How can we help you today?",
  accentColor: "#B0812B",
  position: "right",
  defaultGroupId: "",
  allowDomains: "",
};

type TelProvider = { id: string; name: string; providerType: string; host: string; port: number; username: string; password: string; transport: string; fromDomain: string | null; callerIdName: string | null; callerIdNum: string | null; isActive: boolean; isDefault: boolean; notes: string | null };
type TelExtension = { id: string; number: string; userId: string | null; isActive: boolean };
type TelBlacklist = { id: string; number: string; reason: string | null; createdAt: string };

const moduleLabels: Record<ModuleId, string> = { home: "Home", tasks: "Tasks", projects: "Companies", documents: "Documents", email: "E-Mail", board: "Board", leads: "Leads", clients: "Organizations", contacts: "Contacts", team: "Team", calendar: "Calendar", chat: "Chat", livechat: "Live Chat", servicedesk: "Ticket Desk", products: "Products", accounting: "Accounting", ebank: "e-Bank", telephony: "Telephony", search: "Search", help: "Help", administration: "Administration" };
const DEFAULT_SETTINGS: SettingsForm = { appName: DEFAULT_APP_NAME, appTagline: DEFAULT_APP_TAGLINE, supportEmail: "", defaultTimezone: "UTC", themePrimary: "#AA8038", sidebarFrom: "#6E4C0D", sidebarMid: "#563C0D", sidebarTo: "#453311", topbarFrom: "#67470B", topbarMid: "#8E610C", topbarTo: "#BF8210", topbarAccent: "#AA8038", aiModel: "qwen2.5:7b", conversationAuthorEditDeleteWindowMinutes: 5 };
const DEFAULT_LEAD_STAGE_FLOW = ["new", "qualified", "proposal", "negotiation", "won"];
const DEFAULT_LEAD_SOURCE_OPTIONS = ["Website", "Referral", "Cold Call", "Social Media", "Campaign", "Partner"];
const DEFAULT_LEAD_FORM_FIELDS: LeadConfigField[] = [
  { id: "title", label: "Lead Title", enabled: true, required: true, order: 1, placeholder: "Potential onboarding call" },
  { id: "companyName", label: "Company", enabled: true, required: true, order: 2, placeholder: "Acme Global" },
  { id: "contactName", label: "Contact Name", enabled: true, required: false, order: 3, placeholder: "John Doe" },
  { id: "email", label: "Email", enabled: true, required: false, order: 4, placeholder: "john@example.com" },
  { id: "phone", label: "Phone", enabled: true, required: false, order: 5, placeholder: "+971..." },
  { id: "country", label: "Country", enabled: false, required: false, order: 6, placeholder: "UAE" },
  { id: "language", label: "Language", enabled: false, required: false, order: 7, placeholder: "en" },
  { id: "source", label: "Source", enabled: true, required: false, order: 8, placeholder: "Website / Referral" },
  { id: "priority", label: "Priority", enabled: true, required: false, order: 9, placeholder: "normal" },
  { id: "notes", label: "Notes", enabled: true, required: false, order: 10, placeholder: "Context, goals, and constraints" },
];
const actions: PermissionAction[] = ["read", "write", "manage"];
const EMPTY_NEW_USER_FORM: NewUserForm = {
  login: "",
  email: "",
  password: "",
  name: "",
  surname: "",
  fullname: "",
  position: "",
  department: "",
  isAdmin: false,
  isActive: true,
  roleIds: [],
};
const DEPARTMENTS_SETTING_KEY = "org.departments.catalog";
const TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES_KEY =
  "tasks.conversation.authorEditDeleteWindowMinutes";

function normalizeConversationWindowMinutes(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.conversationAuthorEditDeleteWindowMinutes;
  return Math.min(1440, Math.max(1, parsed));
}

function createClientId(prefix: string) {
  const secureUuid = globalThis.crypto?.randomUUID?.();
  if (secureUuid) return secureUuid;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseDepartmentsFromSetting(raw: string | undefined): DepartmentItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const nowIso = new Date().toISOString();
    return parsed
      .map((item): DepartmentItem | null => {
        if (!item || typeof item !== "object") return null;
        const source = item as Record<string, unknown>;
        const name = String(source.name ?? "").trim();
        if (!name) return null;
        const id = String(source.id ?? "").trim() || createClientId("dept");
        const createdAt = String(source.createdAt ?? "").trim() || nowIso;
        const updatedAt = String(source.updatedAt ?? "").trim() || nowIso;
        return {
          id,
          name,
          isActive: source.isActive !== false,
          createdAt,
          updatedAt,
        };
      })
      .filter((item): item is DepartmentItem => Boolean(item))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function serializeDepartments(departments: DepartmentItem[]) {
  return JSON.stringify(
    departments.map((department) => ({
      id: department.id,
      name: department.name.trim(),
      isActive: department.isActive,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
    }))
  );
}

function toSecurityForm(policy: SecurityPolicy): SecurityForm {
  return {
    ipAllowlistText: policy.ipAllowlist.join("\n"),
    ipBlocklistText: policy.ipBlocklist.join("\n"),
    countryAllowlistText: policy.countryAllowlist.join("\n"),
    countryBlocklistText: policy.countryBlocklist.join("\n"),
    rateMaxAttempts: policy.loginRateLimit.maxAttempts,
    rateWindowMinutes: policy.loginRateLimit.windowMinutes,
    rateLockMinutes: policy.loginRateLimit.lockMinutes,
    minPasswordLength: policy.passwordPolicy.minLength,
    requireUpper: policy.passwordPolicy.requireUpper,
    requireLower: policy.passwordPolicy.requireLower,
    requireNumber: policy.passwordPolicy.requireNumber,
    requireSymbol: policy.passwordPolicy.requireSymbol,
    enforce2FAForAdmins: policy.enforce2FAForAdmins,
    sessionMaxMinutes: policy.sessionMaxMinutes,
  };
}

function toSecurityPolicy(form: SecurityForm): SecurityPolicy {
  return {
    ipAllowlist: parseListFromText(form.ipAllowlistText),
    ipBlocklist: parseListFromText(form.ipBlocklistText),
    countryAllowlist: parseListFromText(form.countryAllowlistText).map((code) => code.toUpperCase()),
    countryBlocklist: parseListFromText(form.countryBlocklistText).map((code) => code.toUpperCase()),
    loginRateLimit: {
      maxAttempts: Math.max(1, Math.min(50, Math.round(form.rateMaxAttempts || DEFAULT_SECURITY_POLICY.loginRateLimit.maxAttempts))),
      windowMinutes: Math.max(1, Math.min(120, Math.round(form.rateWindowMinutes || DEFAULT_SECURITY_POLICY.loginRateLimit.windowMinutes))),
      lockMinutes: Math.max(1, Math.min(240, Math.round(form.rateLockMinutes || DEFAULT_SECURITY_POLICY.loginRateLimit.lockMinutes))),
    },
    passwordPolicy: {
      minLength: Math.max(8, Math.min(128, Math.round(form.minPasswordLength || DEFAULT_SECURITY_POLICY.passwordPolicy.minLength))),
      requireUpper: form.requireUpper,
      requireLower: form.requireLower,
      requireNumber: form.requireNumber,
      requireSymbol: form.requireSymbol,
    },
    enforce2FAForAdmins: form.enforce2FAForAdmins,
    sessionMaxMinutes: Math.max(15, Math.min(60 * 24 * 30, Math.round(form.sessionMaxMinutes || DEFAULT_SECURITY_POLICY.sessionMaxMinutes))),
  };
}

function clonePermissions(input?: RolePermissionConfig | null): RolePermissionConfig {
  if (!input) return {};
  const out: RolePermissionConfig = {};
  for (const moduleId of moduleIds) {
    const current = input[moduleId];
    if (current?.length) out[moduleId] = [...current];
  }
  return out;
}

function applyAction(config: RolePermissionConfig, moduleId: ModuleId, action: PermissionAction, enabled: boolean) {
  const current = new Set(config[moduleId] ?? []);
  if (enabled) {
    if (action === "read") current.add("read");
    if (action === "write") { current.add("read"); current.add("write"); }
    if (action === "manage") { current.add("read"); current.add("write"); current.add("manage"); }
  } else {
    if (action === "manage") current.delete("manage");
    if (action === "write") { current.delete("write"); current.delete("manage"); }
    if (action === "read") { current.delete("read"); current.delete("write"); current.delete("manage"); }
  }
  if (current.size === 0) delete config[moduleId];
  else config[moduleId] = Array.from(current);
}

function normalizeHex(value: string, fallback: string) {
  const safe = value.trim();
  return /^#[0-9a-fA-f]{6}$/.test(safe) ? safe : fallback;
}

function toLeadStageKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
}

function stageToLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function applyRuntimeTheme(form: SettingsForm, logoUrl?: string) {
  const root = document.documentElement;
  root.style.setProperty("--primary", normalizeHex(form.themePrimary, "#AA8038"));
  root.style.setProperty("--ring", normalizeHex(form.themePrimary, "#AA8038"));
  root.style.setProperty("--twx-sidebar-from", normalizeHex(form.sidebarFrom, "#6E4C0D"));
  root.style.setProperty("--twx-sidebar-mid", normalizeHex(form.sidebarMid, "#563C0D"));
  root.style.setProperty("--twx-sidebar-to", normalizeHex(form.sidebarTo, "#453311"));
  root.style.setProperty("--twx-topbar-from", normalizeHex(form.topbarFrom, "#67470B"));
  root.style.setProperty("--twx-topbar-mid", normalizeHex(form.topbarMid, "#8E610C"));
  root.style.setProperty("--twx-topbar-to", normalizeHex(form.topbarTo, "#BF8210"));
  root.style.setProperty("--twx-topbar-accent", normalizeHex(form.topbarAccent, "#AA8038"));
  const resolvedLogo = logoUrl ?? "";
  try {
    const existing = JSON.parse(window.localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY) ?? "{}") as Record<string, string>;
    existing["app.name"] = form.appName.trim() || DEFAULT_APP_NAME;
    existing["app.tagline"] = form.appTagline.trim() || DEFAULT_APP_TAGLINE;
    existing["app.logo"] = resolvedLogo;
    window.localStorage.setItem(RUNTIME_SETTINGS_STORAGE_KEY, JSON.stringify(existing));
  } catch { /* no-op */ }
  window.dispatchEvent(new CustomEvent(BRANDING_UPDATED_EVENT, { detail: { appName: form.appName.trim() || DEFAULT_APP_NAME, appTagline: form.appTagline.trim() || DEFAULT_APP_TAGLINE, logoUrl: resolvedLogo } }));
}

function formatDateTime(value: string | null | undefined, timezone: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  try {
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone || "UTC" }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function generateStrongPassword(length = 14) {
  const source = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=";
  const chars = Array.from(crypto.getRandomValues(new Uint32Array(length))).map((value) => source[value % source.length]);
  return chars.join("");
}

export default function AdministrationPage() {
  const { data: session } = useSession();
  const [section, setSection] = useState<AdminSection>("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionData, setPermissionData] = useState<PermissionResponse | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [moduleToggles, setModuleToggles] = useState<ModuleToggle[]>([]);
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(DEFAULT_SETTINGS);
  const [appLogoUrl, setAppLogoUrl] = useState("");
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [insight, setInsight] = useState<AdminInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  // ── Live Chat admin state ──
  const [lcAutomation, setLcAutomation] = useState<LiveChatAutomationForm>({
    autoAssignEnabled: true, routingStrategy: "least_loaded", maxOpenPerAgent: 6,
    translatorEnabled: false, translatorSourceLang: "auto", translatorTargetLang: "en",
    aiInsightsEnabled: true, autoCloseEnabled: false, autoCloseMinutes: 120,
  });
  const [lcAutomationLoading, setLcAutomationLoading] = useState(false);
  const [lcAutomationSaving, setLcAutomationSaving] = useState(false);
  const [lcWidgets, setLcWidgets] = useState<LiveChatWidgetRow[]>([]);
  const [lcWidgetsLoading, setLcWidgetsLoading] = useState(false);
  const [lcWidgetDialogOpen, setLcWidgetDialogOpen] = useState(false);
  const [lcWidgetEditing, setLcWidgetEditing] = useState<LiveChatWidgetRow | null>(null);
  const [lcWidgetForm, setLcWidgetForm] = useState<LiveChatWidgetForm>(EMPTY_WIDGET_FORM);
  const [lcWidgetSaving, setLcWidgetSaving] = useState(false);
  const [lcWidgetDeleting, setLcWidgetDeleting] = useState<string | null>(null);
  const [lcWidgetCopied, setLcWidgetCopied] = useState<string | null>(null);

  const [reportDays, setReportDays] = useState(30);
  const [reports, setReports] = useState<ReportPayload | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsInsightLoading, setReportsInsightLoading] = useState(false);
  const [userLogs, setUserLogs] = useState<AuditLogItem[]>([]);
  const [userLogsLoading, setUserLogsLoading] = useState(false);
  const [userActionSaving, setUserActionSaving] = useState(false);
  const [userPassword, setUserPassword] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createUserSaving, setCreateUserSaving] = useState(false);
  const [departmentDialogOpen, setDepartmentDialogOpen] = useState(false);
  const [departmentSaving, setDepartmentSaving] = useState(false);
  const [departmentNameInput, setDepartmentNameInput] = useState("");
  const [departmentDraft, setDepartmentDraft] = useState<DepartmentItem[]>([]);
  const [securityForm, setSecurityForm] = useState<SecurityForm>(() => toSecurityForm(DEFAULT_SECURITY_POLICY));
  const [securitySaving, setSecuritySaving] = useState(false);
  const [newUserForm, setNewUserForm] = useState<NewUserForm>(EMPTY_NEW_USER_FORM);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserTwoFactor, setSelectedUserTwoFactor] = useState<UserTwoFactorView | null>(null);
  const [userTwoFactorLoading, setUserTwoFactorLoading] = useState(false);
  const [userTwoFactorSaving, setUserTwoFactorSaving] = useState(false);
  const [userTwoFactorSetup, setUserTwoFactorSetup] = useState<{ secret: string; otpAuthUri: string; backupCodes: string[] } | null>(null);
  const [selectedUserGrantMode, setSelectedUserGrantMode] = useState<UserPermissionOverrideMode>("replace");
  const [selectedUserRoleIds, setSelectedUserRoleIds] = useState<string[]>([]);
  const [selectedUserGrants, setSelectedUserGrants] = useState<RolePermissionConfig>({});
  const [leadConfigStageFlow, setLeadConfigStageFlow] = useState<string[]>(DEFAULT_LEAD_STAGE_FLOW);
  const [leadConfigSourceText, setLeadConfigSourceText] = useState(
    DEFAULT_LEAD_SOURCE_OPTIONS.join("\n")
  );
  const [leadConfigFormFields, setLeadConfigFormFields] = useState<LeadConfigField[]>(DEFAULT_LEAD_FORM_FIELDS);
  const [leadConfigNewStage, setLeadConfigNewStage] = useState("");
  const [leadConfigSaving, setLeadConfigSaving] = useState(false);
  const [leadConfigCustomFields, setLeadConfigCustomFields] = useState<LeadCustomField[]>([]);
  const [newCustomField, setNewCustomField] = useState<{
    open: boolean; type: LeadCustomFieldType; label: string; placeholder: string; required: boolean; options: string;
  }>({ open: false, type: "text", label: "", placeholder: "", required: false, options: "" });
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleColor, setRoleColor] = useState("#3B4A61");
  const [rolePermissions, setRolePermissions] = useState<RolePermissionConfig>({});
  const [activeWorkflowModule, setActiveWorkflowModule] = useState<"tasks" | "servicedesk" | "projectTasks">("tasks");
  const [workflowConfig, setWorkflowConfig] = useState<WorkflowConfig>({
    tasks: [
      { key: "opened", label: "Open", color: "#22c55e", isClosed: false, isDefault: true, order: 0 },
      { key: "completed", label: "Completed", color: "#3b82f6", isClosed: true, isDefault: false, order: 1 },
      { key: "closed", label: "Closed", color: "#64748b", isClosed: true, isDefault: false, order: 2 },
    ],
    servicedesk: [
      { key: "open", label: "Open", color: "#22c55e", isClosed: false, isDefault: true, order: 0 },
      { key: "pending", label: "Pending", color: "#f59e0b", isClosed: false, isDefault: false, order: 1 },
      { key: "closed", label: "Closed", color: "#64748b", isClosed: true, isDefault: false, order: 2 },
    ],
    projectTasks: [
      { key: "todo", label: "To Do", color: "#64748b", isClosed: false, isDefault: true, order: 0 },
      { key: "in_progress", label: "In Progress", color: "#3b82f6", isClosed: false, isDefault: false, order: 1 },
      { key: "done", label: "Done", color: "#22c55e", isClosed: true, isDefault: false, order: 2 },
      { key: "cancelled", label: "Cancelled", color: "#ef4444", isClosed: true, isDefault: false, order: 3 },
    ],
  });
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [userEmailConfig, setUserEmailConfig] = useState<EmailConfigForm | null>(null);
  const [emailConfigUserId, setEmailConfigUserId] = useState<string | null>(null);
  const [savingEmailConfig, setSavingEmailConfig] = useState(false);
  const [emailConfigOpen, setEmailConfigOpen] = useState(false);

  // ── Tenant management state ──
  const [isPlatform, setIsPlatform] = useState(false);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantItem | null>(null);
  const [tenantForm, setTenantForm] = useState<TenantForm>(EMPTY_TENANT_FORM);
  const [createTenantOpen, setCreateTenantOpen] = useState(false);
  const [tenantSaving, setTenantSaving] = useState(false);

  // ── Ticket Widget state ──
  const [ticketWidgets, setTicketWidgets] = useState<TicketWidgetItem[]>([]);
  const [twLoading, setTwLoading] = useState(false);
  const [widgetForm, setWidgetForm] = useState<TicketWidgetForm>(EMPTY_TICKET_WIDGET_FORM);
  const [createWidgetOpen, setCreateWidgetOpen] = useState(false);
  const [editingTicketWidgetId, setEditingTicketWidgetId] = useState<string | null>(null);
  const [widgetSaving, setWidgetSaving] = useState(false);
  const [showEmbedFor, setShowEmbedFor] = useState<string | null>(null);
  const [twWidgetCopied, setTwWidgetCopied] = useState(false);

  // ── Telephony admin state ──
  const [telTab, setTelTab] = useState<"providers" | "extensions" | "blacklist" | "guide">("providers");
  const [providers, setProviders] = useState<TelProvider[]>([]);
  const [extensions, setExtensions] = useState<TelExtension[]>([]);
  const [blacklist, setBlacklist] = useState<TelBlacklist[]>([]);
  const [telLoading, setTelLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<TelProvider | null>(null);
  const [providerFormOpen, setProviderFormOpen] = useState(false);
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerDeleting, setProviderDeleting] = useState(false);
  const [showProviderPassword, setShowProviderPassword] = useState(false);
  const [providerForm, setProviderForm] = useState<{
    name: string; providerType: string; host: string; port: number; username: string; password: string;
    transport: string; fromDomain: string; callerIdName: string; callerIdNum: string;
    isActive: boolean; isDefault: boolean; notes: string;
  }>({ name: "", providerType: "generic", host: "", port: 5060, username: "", password: "", transport: "UDP", fromDomain: "", callerIdName: "", callerIdNum: "", isActive: true, isDefault: false, notes: "" });
  const [extFormOpen, setExtFormOpen] = useState(false);
  const [extSaving, setExtSaving] = useState(false);
  const [extForm, setExtForm] = useState<{ number: string; userId: string; password: string; isActive: boolean }>({ number: "", userId: "", password: "", isActive: true });
  const [blNumber, setBlNumber] = useState("");
  const [blReason, setBlReason] = useState("");
  const [blSaving, setBlSaving] = useState(false);

  const isAdminUser = Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin || permissionData?.isAdmin);
  const sectionPermissions = permissionData?.permissions ?? {};
  const hasModuleAction = (moduleId: ModuleId, action: PermissionAction) => {
    if (isAdminUser) return true;
    const modulePermission = sectionPermissions[moduleId];
    if (!modulePermission) return false;
    if (action === "read") return Boolean(modulePermission.read || modulePermission.write || modulePermission.manage);
    if (action === "write") return Boolean(modulePermission.write || modulePermission.manage);
    return Boolean(modulePermission.manage);
  };
  const canManageAdministration = hasModuleAction("administration", "manage");
  const canManageLivechat = hasModuleAction("livechat", "manage");
  const canReadLivechat = hasModuleAction("livechat", "read");
  const canManageServicedesk = hasModuleAction("servicedesk", "manage");
  const canManageTelephony = hasModuleAction("telephony", "manage");
  const canReadTelephony = hasModuleAction("telephony", "read");
  const canManageTenants = isPlatform && isAdminUser;
  const canReadSection = (sectionId: AdminSection) => {
    if (sectionId === "livechat") return canReadLivechat;
    if (sectionId === "ticketwidgets") return canManageServicedesk;
    if (sectionId === "telephony") return canReadTelephony;
    if (sectionId === "tenants") return canManageTenants;
    return hasModuleAction("administration", "read");
  };
  const canManage = (() => {
    if (section === "livechat") return canManageLivechat;
    if (section === "ticketwidgets") return canManageServicedesk;
    if (section === "telephony") return canManageTelephony;
    if (section === "tenants") return canManageTenants;
    return canManageAdministration;
  })();
  const sectionManageHint = (() => {
    if (section === "livechat") return "Read-only mode: livechat.manage permission required for changes.";
    if (section === "ticketwidgets") return "Read-only mode: servicedesk.manage permission required for changes.";
    if (section === "telephony") return "Read-only mode: telephony.manage permission required for changes.";
    if (section === "tenants") return "Read-only mode: platform admin access required for tenant changes.";
    return "Read-only mode: administration.manage permission required for changes.";
  })();
  const sectionItems = [
    { id: "overview" as AdminSection, label: "Overview", icon: LayoutDashboard, visible: canReadSection("overview") },
    { id: "users" as AdminSection, label: "Users & Access", icon: Users, visible: canReadSection("users") },
    { id: "roles" as AdminSection, label: "Roles", icon: Shield, visible: canReadSection("roles") },
    { id: "settings" as AdminSection, label: "Settings", icon: Palette, visible: canReadSection("settings") },
    { id: "leadConfig" as AdminSection, label: "Leads Config", icon: ClipboardList, visible: canReadSection("leadConfig") },
    { id: "workflowConfig" as AdminSection, label: "Workflow Stages", icon: GitBranch, visible: canReadSection("workflowConfig") },
    { id: "modules" as AdminSection, label: "Modules", icon: Blocks, visible: canReadSection("modules") },
    { id: "security" as AdminSection, label: "Security", icon: KeyRound, visible: canReadSection("security") },
    { id: "deployment" as AdminSection, label: "Deployment & SSL", icon: Server, visible: canReadSection("deployment") },
    { id: "livechat" as AdminSection, label: "Live Chat", icon: MessageSquare, visible: canReadSection("livechat") },
    { id: "ticketwidgets" as AdminSection, label: "Ticket Widgets", icon: TicketCheck, visible: canReadSection("ticketwidgets") },
    { id: "telephony" as AdminSection, label: "Telephony", icon: Phone, visible: canReadSection("telephony") },
    { id: "reports" as AdminSection, label: "Reports", icon: BarChart3, visible: canReadSection("reports") },
    { id: "logs" as AdminSection, label: "Audit Logs", icon: FileClock, visible: canReadSection("logs") },
    { id: "tenants" as AdminSection, label: "Tenants", icon: Globe, visible: canReadSection("tenants") },
  ].filter((item) => item.visible);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const timezone = reports?.timezone || settingsForm.defaultTimezone || "UTC";

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => `${u.fullname} ${u.login} ${u.email} ${u.department}`.toLowerCase().includes(q));
  }, [users, userSearch]);

  async function responseErrorMessage(response: Response, fallback: string) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return payload?.error?.trim() || fallback;
  }

  useEffect(() => {
    if (sectionItems.length === 0) return;
    if (!sectionItems.some((item) => item.id === section)) {
      setSection(sectionItems[0].id);
    }
  }, [sectionItems, section]);

  async function loadUserGrants(userId: string) {
    try {
      const response = await fetch(`/api/administration/users/${userId}/permissions`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load direct permissions");
      const data = (await response.json()) as {
        mode?: UserPermissionOverrideMode;
        grants?: RolePermissionConfig;
      };
      setSelectedUserGrantMode(data.mode === "merge" ? "merge" : "replace");
      setSelectedUserGrants(clonePermissions(data.grants ?? {}));
    } catch {
      setSelectedUserGrantMode("replace");
      setSelectedUserGrants({});
    }
  }

  async function loadUserLogs(userId: string) {
    setUserLogsLoading(true);
    try {
      const response = await fetch(`/api/administration/logs?userId=${encodeURIComponent(userId)}&limit=60`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load user logs");
      const data = (await response.json()) as AuditLogItem[];
      setUserLogs(Array.isArray(data) ? data : []);
    } catch {
      setUserLogs([]);
    } finally {
      setUserLogsLoading(false);
    }
  }

  async function loadUserTwoFactor(userId: string) {
    setUserTwoFactorLoading(true);
    try {
      const response = await fetch(`/api/administration/users/${userId}/2fa`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load 2-step status");
      const data = (await response.json()) as UserTwoFactorView;
      setSelectedUserTwoFactor({
        enabled: Boolean(data.enabled),
        backupCodesRemaining: Number(data.backupCodesRemaining ?? 0),
        hasSecret: Boolean(data.hasSecret),
        updatedAt: data.updatedAt ?? null,
      });
    } catch {
      setSelectedUserTwoFactor(null);
    } finally {
      setUserTwoFactorLoading(false);
    }
  }

  async function loadLcAutomation() {
    setLcAutomationLoading(true);
    try {
      const res = await fetch("/api/livechat/settings", { cache: "no-store" });
      if (!res.ok) throw new Error(await responseErrorMessage(res, "Failed to load live chat automation settings"));
      const data = (await res.json()) as LiveChatAutomationForm;
      setLcAutomation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load live chat automation settings");
    } finally { setLcAutomationLoading(false); }
  }

  async function saveLcAutomation() {
    setLcAutomationSaving(true);
    try {
      const res = await fetch("/api/livechat/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lcAutomation),
      });
      const data = (await res.json().catch(() => null)) as (LiveChatAutomationForm & { error?: string }) | null;
      if (!res.ok || !data) throw new Error(data?.error ?? "Save failed");
      setLcAutomation(data);
      toast.success("Automation settings saved");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setLcAutomationSaving(false); }
  }

  async function loadLcWidgets() {
    setLcWidgetsLoading(true);
    try {
      const res = await fetch("/api/administration/livechat/widgets", { cache: "no-store" });
      if (!res.ok) throw new Error(await responseErrorMessage(res, "Failed to load live chat widgets"));
      const data = (await res.json()) as LiveChatWidgetRow[];
      setLcWidgets(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load live chat widgets");
    } finally { setLcWidgetsLoading(false); }
  }

  async function saveLcWidget() {
    setLcWidgetSaving(true);
    try {
      const url = lcWidgetEditing
        ? `/api/administration/livechat/widgets/${lcWidgetEditing.id}`
        : "/api/administration/livechat/widgets";
      const res = await fetch(url, {
        method: lcWidgetEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lcWidgetForm),
      });
      const data = (await res.json().catch(() => null)) as (LiveChatWidgetRow & { error?: string }) | null;
      if (!res.ok || !data || "error" in data) throw new Error((data as { error?: string } | null)?.error ?? "Save failed");
      toast.success(lcWidgetEditing ? "Widget updated" : "Widget created");
      setLcWidgetDialogOpen(false);
      setLcWidgetEditing(null);
      await loadLcWidgets();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setLcWidgetSaving(false); }
  }

  async function deleteLcWidget(id: string) {
    setLcWidgetDeleting(id);
    try {
      const res = await fetch(`/api/administration/livechat/widgets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Widget deleted");
      await loadLcWidgets();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Delete failed"); }
    finally { setLcWidgetDeleting(null); }
  }

  async function rotateLcWidgetToken(id: string) {
    try {
      const res = await fetch(`/api/administration/livechat/widgets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotateToken: true }),
      });
      const data = (await res.json().catch(() => null)) as (LiveChatWidgetRow & { error?: string }) | null;
      if (!res.ok || !data || "error" in data) throw new Error((data as { error?: string } | null)?.error ?? "Failed");
      toast.success("Token rotated");
      await loadLcWidgets();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  }

  async function copyWidgetScript(widget: LiveChatWidgetRow) {
    const origin = window.location.origin;
    const script = `<script async src="${origin}/api/public/livechat/loader?token=${encodeURIComponent(widget.token)}"></script>`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(script);
      } else {
        const el = document.createElement("textarea");
        el.value = script;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setLcWidgetCopied(widget.id);
      setTimeout(() => setLcWidgetCopied(null), 2000);
    } catch { toast.error("Copy failed"); }
  }

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [permRes, usersRes, rolesRes, modulesRes, settingsRes, leadsConfigRes] = await Promise.all([
        fetch("/api/permissions", { cache: "no-store" }),
        fetch("/api/administration/users", { cache: "no-store" }),
        fetch("/api/administration/roles", { cache: "no-store" }),
        fetch("/api/administration/modules", { cache: "no-store" }),
        fetch("/api/administration/settings", { cache: "no-store" }),
        fetch("/api/administration/leads-config", { cache: "no-store" }),
      ]);

      // If the session is stale (user deleted from DB), sign out automatically
      if (permRes.status === 401 || usersRes.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      const failedResources: string[] = [];
      if (!permRes.ok) failedResources.push("permissions");
      if (!usersRes.ok) failedResources.push("users");
      if (!rolesRes.ok) failedResources.push("roles");
      if (!modulesRes.ok) failedResources.push("modules");
      if (!settingsRes.ok) failedResources.push("settings");
      if (!leadsConfigRes.ok) failedResources.push("leads config");

      const permJson = permRes.ok ? ((await permRes.json()) as PermissionResponse) : null;
      const usersJson = usersRes.ok ? ((await usersRes.json()) as AdminUser[]) : [];
      const rolesJson = rolesRes.ok ? ((await rolesRes.json()) as { roles: RoleSummary[] }) : { roles: [] };
      const modulesJson = modulesRes.ok ? ((await modulesRes.json()) as { modules: ModuleToggle[] }) : { modules: [] };
      const settingsJson = settingsRes.ok ? ((await settingsRes.json()) as Record<string, string>) : ({} as Record<string, string>);
      const leadsConfigJson = leadsConfigRes.ok ? ((await leadsConfigRes.json()) as LeadConfigResponse) : ({} as LeadConfigResponse);

      setPermissionData(permJson);
      setUsers(usersJson);
      setRoles(rolesJson.roles ?? []);
      setModuleToggles(modulesJson.modules ?? []);
      setSettingsForm({
        appName: settingsJson["app.name"] ?? DEFAULT_SETTINGS.appName,
        appTagline: settingsJson["app.tagline"] ?? DEFAULT_SETTINGS.appTagline,
        supportEmail: settingsJson["app.supportEmail"] ?? DEFAULT_SETTINGS.supportEmail,
        defaultTimezone: settingsJson["system.defaultTimezone"] ?? DEFAULT_SETTINGS.defaultTimezone,
        themePrimary: settingsJson["theme.primary"] ?? DEFAULT_SETTINGS.themePrimary,
        sidebarFrom: settingsJson["theme.sidebar.from"] ?? DEFAULT_SETTINGS.sidebarFrom,
        sidebarMid: settingsJson["theme.sidebar.mid"] ?? DEFAULT_SETTINGS.sidebarMid,
        sidebarTo: settingsJson["theme.sidebar.to"] ?? DEFAULT_SETTINGS.sidebarTo,
        topbarFrom: settingsJson["theme.topbar.from"] ?? DEFAULT_SETTINGS.topbarFrom,
        topbarMid: settingsJson["theme.topbar.mid"] ?? DEFAULT_SETTINGS.topbarMid,
        topbarTo: settingsJson["theme.topbar.to"] ?? DEFAULT_SETTINGS.topbarTo,
        topbarAccent: settingsJson["theme.topbar.accent"] ?? DEFAULT_SETTINGS.topbarAccent,
        aiModel: settingsJson["ai.model"] ?? DEFAULT_SETTINGS.aiModel,
        conversationAuthorEditDeleteWindowMinutes: normalizeConversationWindowMinutes(
          settingsJson[TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES_KEY]
        ),
      });
      setAppLogoUrl(settingsJson["app.logo"] ?? "");
      setLeadConfigStageFlow(
        Array.isArray(leadsConfigJson.stageFlow) && leadsConfigJson.stageFlow.length > 0
          ? leadsConfigJson.stageFlow
          : DEFAULT_LEAD_STAGE_FLOW
      );
      setLeadConfigSourceText(
        Array.isArray(leadsConfigJson.sourceOptions) && leadsConfigJson.sourceOptions.length > 0
          ? leadsConfigJson.sourceOptions.join("\n")
          : DEFAULT_LEAD_SOURCE_OPTIONS.join("\n")
      );
      setLeadConfigFormFields(
        Array.isArray(leadsConfigJson.formFields) && leadsConfigJson.formFields.length > 0
          ? leadsConfigJson.formFields
          : DEFAULT_LEAD_FORM_FIELDS
      );
      setLeadConfigCustomFields(Array.isArray(leadsConfigJson.customFields) ? leadsConfigJson.customFields : []);
      setSecurityForm(toSecurityForm(parseSecurityPolicy(settingsJson["security.policy.v1"])));
      const parsedDepartments = parseDepartmentsFromSetting(settingsJson[DEPARTMENTS_SETTING_KEY]);
      if (parsedDepartments.length > 0) {
        setDepartments(parsedDepartments);
      } else {
        const nowIso = new Date().toISOString();
        const fallbackDepartments = Array.from(
          new Set(
            usersJson
              .map((user) => user.department?.trim())
              .filter((department): department is string => Boolean(department))
          )
        )
          .sort((a, b) => a.localeCompare(b))
          .map((name) => ({
            id: createClientId("dept"),
            name,
            isActive: true,
            createdAt: nowIso,
            updatedAt: nowIso,
          }));
        setDepartments(fallbackDepartments);
      }

      if (!selectedUserId && usersJson.length > 0) {
        setSelectedUserId(usersJson[0].id);
        setSelectedUserRoleIds(usersJson[0].roles.map((role) => role.id));
        await Promise.all([
          loadUserGrants(usersJson[0].id),
          loadUserLogs(usersJson[0].id),
          loadUserTwoFactor(usersJson[0].id),
        ]);
      }
      if (!selectedRoleId && rolesJson.roles?.length > 0) {
        const role = rolesJson.roles[0];
        setSelectedRoleId(role.id);
        setRoleName(role.name);
        setRoleColor(role.color);
        setRolePermissions(clonePermissions(role.permissions));
      }
      if (failedResources.length > 0) {
        setError(`Some administration resources failed to load: ${failedResources.join(", ")}`);
      }
      void loadWorkflowConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load administration data");
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs() {
    try {
      const response = await fetch("/api/administration/logs?limit=200", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load logs");
      const data = (await response.json()) as AuditLogItem[];
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    }
  }

  async function loadReports(withInsight = false) {
    if (withInsight) setReportsInsightLoading(true);
    else setReportsLoading(true);
    try {
      const response = await fetch(`/api/administration/reports?days=${reportDays}${withInsight ? "&insight=1" : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load reports");
      const data = (await response.json()) as ReportPayload;
      setReports(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      if (withInsight) setReportsInsightLoading(false);
      else setReportsLoading(false);
    }
  }

  useEffect(() => { void fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (section === "livechat") {
      if (!canReadSection("livechat")) {
        setError("Missing livechat.read permission for this section.");
        return;
      }
      void loadLcAutomation();
      void loadLcWidgets();
    }
  }, [section, canReadLivechat]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (section === "logs") void loadLogs();
    if (section === "reports" && !reports && !reportsLoading) void loadReports();
  }, [section, reports, reportsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "";
    const host = window.location.hostname;
    setIsPlatform(!platformDomain || host === platformDomain || host === "localhost" || host === "127.0.0.1");
  }, []);

  const loadTenants = useCallback(async () => {
    setTenantsLoading(true);
    try {
      const r = await fetch("/api/platform/tenants");
      if (!r.ok) {
        throw new Error(await responseErrorMessage(r, "Failed to load tenants"));
      }
      setTenants((await r.json()) as TenantItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tenants");
    } finally { setTenantsLoading(false); }
  }, []);

  useEffect(() => {
    if (section === "tenants") {
      if (!canReadSection("tenants")) {
        setError("Missing platform admin access for tenant management.");
        return;
      }
      void loadTenants();
    }
  }, [section, loadTenants, canManageTenants]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTicketWidgets = useCallback(async () => {
    setTwLoading(true);
    try {
      const r = await fetch("/api/ticket-widgets");
      if (!r.ok) {
        throw new Error(await responseErrorMessage(r, "Failed to load ticket widgets"));
      }
      setTicketWidgets((await r.json()) as TicketWidgetItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket widgets");
    } finally { setTwLoading(false); }
  }, []);

  useEffect(() => {
    if (section === "ticketwidgets") {
      if (!canReadSection("ticketwidgets")) {
        setError("Missing servicedesk.manage permission for ticket widgets.");
        return;
      }
      void loadTicketWidgets();
    }
  }, [section, loadTicketWidgets, canManageServicedesk]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTelephony = useCallback(async () => {
    setTelLoading(true);
    try {
      const [providerRes, extensionRes, blacklistRes] = await Promise.all([
        fetch("/api/telephony/providers"),
        fetch("/api/telephony/extensions"),
        fetch("/api/telephony/blacklist"),
      ]);
      if (!providerRes.ok) throw new Error(await responseErrorMessage(providerRes, "Failed to load telephony providers"));
      if (!extensionRes.ok) throw new Error(await responseErrorMessage(extensionRes, "Failed to load telephony extensions"));
      if (!blacklistRes.ok) throw new Error(await responseErrorMessage(blacklistRes, "Failed to load telephony blacklist"));
      const [pr, ex, bl] = await Promise.all([
        providerRes.json(),
        extensionRes.json(),
        blacklistRes.json(),
      ]);
      setProviders(Array.isArray(pr) ? pr as TelProvider[] : []);
      setExtensions(Array.isArray(ex) ? ex as TelExtension[] : []);
      setBlacklist(Array.isArray(bl) ? bl as TelBlacklist[] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load telephony data");
    }
    finally { setTelLoading(false); }
  }, []);

  useEffect(() => {
    if (section === "telephony") {
      if (!canReadSection("telephony")) {
        setError("Missing telephony.read permission for telephony administration.");
        return;
      }
      void loadTelephony();
    }
  }, [section, loadTelephony, canReadTelephony]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedUserId) {
      setUserLogs([]);
      setSelectedUserGrants({});
      setSelectedUserGrantMode("replace");
      setSelectedUserTwoFactor(null);
      setUserTwoFactorSetup(null);
      return;
    }
    void loadUserGrants(selectedUserId);
    void loadUserLogs(selectedUserId);
    void loadUserTwoFactor(selectedUserId);
  }, [selectedUserId]);

  async function saveSettings() {
    setSaving(true);
    setError(null);
    try {
      const settingsPayload: Record<string, string> = {
        "app.name": settingsForm.appName.trim() || DEFAULT_APP_NAME,
        "app.tagline": settingsForm.appTagline.trim() || DEFAULT_APP_TAGLINE,
        "app.logo": appLogoUrl,
        "app.supportEmail": settingsForm.supportEmail.trim(),
        "system.defaultTimezone": settingsForm.defaultTimezone.trim() || "UTC",
        "theme.primary": normalizeHex(settingsForm.themePrimary, "#AA8038"),
        "theme.sidebar.from": normalizeHex(settingsForm.sidebarFrom, "#6E4C0D"),
        "theme.sidebar.mid": normalizeHex(settingsForm.sidebarMid, "#563C0D"),
        "theme.sidebar.to": normalizeHex(settingsForm.sidebarTo, "#453311"),
        "theme.topbar.from": normalizeHex(settingsForm.topbarFrom, "#67470B"),
        "theme.topbar.mid": normalizeHex(settingsForm.topbarMid, "#8E610C"),
        "theme.topbar.to": normalizeHex(settingsForm.topbarTo, "#BF8210"),
        "theme.topbar.accent": normalizeHex(settingsForm.topbarAccent, "#AA8038"),
        "ai.model": settingsForm.aiModel.trim() || "qwen2.5:7b",
        [TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES_KEY]: String(
          normalizeConversationWindowMinutes(settingsForm.conversationAuthorEditDeleteWindowMinutes)
        ),
      };
      const response = await fetch("/api/administration/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: settingsPayload }) });
      if (!response.ok) throw new Error("Failed to save settings");
      applyRuntimeTheme(settingsForm, appLogoUrl);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function saveSecurityPolicy() {
    setSecuritySaving(true);
    setError(null);
    try {
      const policy = toSecurityPolicy(securityForm);
      const response = await fetch("/api/administration/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            "security.policy.v1": serializeSecurityPolicy(policy),
          },
        }),
      });
      if (!response.ok) throw new Error("Failed to save security policy");
      setSecurityForm(toSecurityForm(policy));
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save security policy");
    } finally {
      setSecuritySaving(false);
    }
  }

  function addLeadConfigStage() {
    const stage = toLeadStageKey(leadConfigNewStage);
    if (!stage) return;
    if (leadConfigStageFlow.includes(stage)) {
      setError("Stage already exists.");
      return;
    }
    const next = leadConfigStageFlow.filter((item) => item !== "won");
    next.push(stage);
    next.push("won");
    setLeadConfigStageFlow(next);
    setLeadConfigNewStage("");
    setError(null);
  }

  function removeLeadConfigStage(stage: string) {
    if (stage === "won") {
      setError("Final stage 'won' cannot be removed.");
      return;
    }
    const next = leadConfigStageFlow.filter((item) => item !== stage);
    setLeadConfigStageFlow(next.length ? next : ["new", "won"]);
    setError(null);
  }

  function updateLeadConfigField(
    fieldId: LeadConfigFieldId,
    patch: Partial<Omit<LeadConfigField, "id">>
  ) {
    setLeadConfigFormFields((prev) =>
      prev.map((field) => {
        if (field.id !== fieldId) return field;
        const locked = field.id === "title" || field.id === "companyName";
        const nextEnabled = locked ? true : patch.enabled ?? field.enabled;
        const nextRequired = locked ? true : nextEnabled ? patch.required ?? field.required : false;
        const nextOrderRaw =
          patch.order === undefined
            ? field.order
            : Math.max(1, Math.min(1000, Math.round(patch.order)));
        return {
          ...field,
          ...patch,
          enabled: nextEnabled,
          required: nextRequired,
          order: Number.isFinite(nextOrderRaw) ? nextOrderRaw : field.order,
        };
      })
    );
  }

  async function saveLeadConfig() {
    setLeadConfigSaving(true);
    setError(null);
    try {
      const sourceOptions = leadConfigSourceText
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
      const response = await fetch("/api/administration/leads-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageFlow: leadConfigStageFlow,
          sourceOptions,
          formFields: leadConfigFormFields,
          customFields: leadConfigCustomFields,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | LeadConfigResponse
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? "Failed to save lead configuration");
      }

      const nextPayload = payload as LeadConfigResponse;
      setLeadConfigStageFlow(nextPayload.stageFlow ?? DEFAULT_LEAD_STAGE_FLOW);
      setLeadConfigSourceText((nextPayload.sourceOptions ?? DEFAULT_LEAD_SOURCE_OPTIONS).join("\n"));
      setLeadConfigFormFields(nextPayload.formFields ?? DEFAULT_LEAD_FORM_FIELDS);
      setLeadConfigCustomFields(nextPayload.customFields ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lead configuration");
    } finally {
      setLeadConfigSaving(false);
    }
  }

  async function saveModuleToggles() {
    setSaving(true);
    setError(null);
    try {
      const enabledModules = moduleToggles.filter((m) => m.enabled).map((m) => m.id);
      const response = await fetch("/api/administration/modules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabledModules }) });
      if (!response.ok) throw new Error("Failed to save module toggles");
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save module toggles");
    } finally {
      setSaving(false);
    }
  }

  async function saveUserRoles() {
    if (!selectedUserId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/administration/users/${selectedUserId}/roles`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupIds: selectedUserRoleIds }) });
      if (!response.ok) throw new Error("Failed to save user roles");
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save user roles");
    } finally {
      setSaving(false);
    }
  }

  async function saveUserGrants() {
    if (!selectedUserId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/administration/users/${selectedUserId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: selectedUserGrantMode, grants: selectedUserGrants }),
      });
      if (!response.ok) throw new Error("Failed to save user direct permissions");
      await fetchAll();
      await loadUserGrants(selectedUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save user direct permissions");
    } finally {
      setSaving(false);
    }
  }

  async function updateSelectedUser(patch: { isActive?: boolean; isAdmin?: boolean; workState?: number; department?: string }) {
    if (!selectedUserId) return;
    setUserActionSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/administration/users/${selectedUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to update user");
      }
      await fetchAll();
      await loadUserLogs(selectedUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setUserActionSaving(false);
    }
  }

  async function manageSelectedUserTwoFactor(action: "enable" | "disable" | "rotate" | "backup") {
    if (!selectedUserId) return;
    setUserTwoFactorSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/administration/users/${selectedUserId}/2fa`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        secret?: string;
        otpAuthUri?: string;
        backupCodes?: string[];
      };
      if (!response.ok) throw new Error(data.error ?? "2-step update failed");

      if (data.secret || data.backupCodes) {
        setUserTwoFactorSetup({
          secret: data.secret ?? "",
          otpAuthUri: data.otpAuthUri ?? "",
          backupCodes: data.backupCodes ?? [],
        });
      } else {
        setUserTwoFactorSetup(null);
      }
      await loadUserTwoFactor(selectedUserId);
      await loadUserLogs(selectedUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "2-step update failed");
    } finally {
      setUserTwoFactorSaving(false);
    }
  }

  async function saveSelectedUserPassword() {
    if (!selectedUserId) return;
    const password = userPassword.trim();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setUserActionSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/administration/users/${selectedUserId}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to change password");
      }
      setUserPassword("");
      await loadUserLogs(selectedUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setUserActionSaving(false);
    }
  }

  async function createUser() {
    const payload: NewUserForm = {
      ...newUserForm,
      login: newUserForm.login.trim(),
      email: newUserForm.email.trim(),
      password: newUserForm.password,
      name: newUserForm.name.trim(),
      surname: newUserForm.surname.trim(),
      fullname: newUserForm.fullname.trim(),
      position: newUserForm.position.trim(),
      department: newUserForm.department.trim(),
      roleIds: Array.from(new Set(newUserForm.roleIds)),
    };

    if (!payload.login || !payload.email || !payload.name || !payload.password) {
      setError("Login, email, first name, and password are required.");
      return;
    }
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(payload.login)) {
      setError("Login must be 3-32 characters and use letters, numbers, dot, underscore, or dash.");
      return;
    }
    const minPasswordLength = Math.max(8, Number(securityForm.minPasswordLength || 8));
    if (payload.password.length < minPasswordLength) {
      setError(`Password must be at least ${minPasswordLength} characters.`);
      return;
    }
    if (securityForm.requireUpper && !/[A-Z]/.test(payload.password)) {
      setError("Password must include at least one uppercase letter.");
      return;
    }
    if (securityForm.requireLower && !/[a-z]/.test(payload.password)) {
      setError("Password must include at least one lowercase letter.");
      return;
    }
    if (securityForm.requireNumber && !/[0-9]/.test(payload.password)) {
      setError("Password must include at least one number.");
      return;
    }
    if (securityForm.requireSymbol && !/[^a-zA-Z0-9]/.test(payload.password)) {
      setError("Password must include at least one symbol.");
      return;
    }

    setCreateUserSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/administration/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create user");
      }

      const createdUserId = data.id ?? null;
      setCreateUserOpen(false);
      setNewUserForm(EMPTY_NEW_USER_FORM);
      await fetchAll();
      if (createdUserId) {
        setSelectedUserId(createdUserId);
        const createdRoleIds = payload.roleIds;
        setSelectedUserRoleIds(createdRoleIds);
        await loadUserGrants(createdUserId);
        await loadUserLogs(createdUserId);
        await loadUserTwoFactor(createdUserId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreateUserSaving(false);
    }
  }

  function openDepartmentDialog() {
    setDepartmentDraft(
      departments
        .map((department) => ({ ...department }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setDepartmentNameInput("");
    setDepartmentDialogOpen(true);
  }

  function addDepartmentToDraft() {
    const name = departmentNameInput.trim();
    if (!name) return;
    const duplicate = departmentDraft.some(
      (department) => department.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setError("Department already exists.");
      return;
    }
    const nowIso = new Date().toISOString();
    setDepartmentDraft((prev) => [
      ...prev,
      {
        id: createClientId("dept"),
        name,
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ]);
    setDepartmentNameInput("");
    setError(null);
  }

  async function saveDepartments() {
    setDepartmentSaving(true);
    setError(null);
    try {
      const normalized = departmentDraft
        .map((department) => ({
          ...department,
          name: department.name.trim(),
          updatedAt: new Date().toISOString(),
        }))
        .filter((department) => department.name.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));

      const response = await fetch("/api/administration/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            [DEPARTMENTS_SETTING_KEY]: serializeDepartments(normalized),
          },
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to save departments");
      }
      setDepartments(normalized);
      setDepartmentDialogOpen(false);
      setDepartmentNameInput("");
      setDepartmentDraft([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save departments");
    } finally {
      setDepartmentSaving(false);
    }
  }

  async function createRole() {
    if (!roleName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/administration/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: roleName.trim(), color: roleColor, permissions: rolePermissions }) });
      if (!response.ok) throw new Error("Failed to create role");
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create role");
    } finally {
      setSaving(false);
    }
  }

  async function updateRole() {
    if (!selectedRoleId || !roleName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/administration/roles/${selectedRoleId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: roleName.trim(), color: roleColor, permissions: rolePermissions }) });
      if (!response.ok) throw new Error("Failed to update role");
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole() {
    if (!selectedRoleId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/administration/roles/${selectedRoleId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete role");
      setSelectedRoleId(null);
      setRoleName("");
      setRoleColor("#3B4A61");
      setRolePermissions({});
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete role");
    } finally {
      setSaving(false);
    }
  }

  async function loadWorkflowConfig() {
    try {
      const res = await fetch("/api/administration/workflow-config");
      if (!res.ok) throw new Error(await responseErrorMessage(res, "Failed to load workflow configuration"));
      const data = await res.json() as WorkflowConfig;
      setWorkflowConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflow configuration");
    }
  }

  async function saveWorkflowConfig() {
    setSavingWorkflow(true);
    try {
      const res = await fetch("/api/administration/workflow-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workflowConfig),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Workflow stages saved");
    } catch {
      toast.error("Failed to save workflow stages");
    } finally {
      setSavingWorkflow(false);
    }
  }

  function addWorkflowStage(module: "tasks" | "servicedesk" | "projectTasks") {
    const stages = workflowConfig[module];
    const newStage: WorkflowStage = {
      key: `stage_${Date.now()}`,
      label: "New Stage",
      color: "#64748b",
      isClosed: false,
      isDefault: false,
      order: stages.length,
    };
    setWorkflowConfig((prev) => ({ ...prev, [module]: [...prev[module], newStage] }));
  }

  function removeWorkflowStage(module: "tasks" | "servicedesk" | "projectTasks", index: number) {
    setWorkflowConfig((prev) => ({
      ...prev,
      [module]: prev[module].filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })),
    }));
  }

  function updateWorkflowStage(module: "tasks" | "servicedesk" | "projectTasks", index: number, updates: Partial<WorkflowStage>) {
    setWorkflowConfig((prev) => ({
      ...prev,
      [module]: prev[module].map((s, i) => {
        if (i !== index) {
          if (updates.isDefault) return { ...s, isDefault: false };
          return s;
        }
        return { ...s, ...updates };
      }),
    }));
  }

  async function handleImpersonate(userId: string) {
    setImpersonating(userId);
    try {
      const res = await fetch("/api/administration/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json() as { token?: string; targetUser?: { name: string }; error?: string };
      if (!res.ok || !data.token) throw new Error(data.error ?? "Impersonation failed");

      const { signIn } = await import("next-auth/react");
      await signIn("impersonate", { token: data.token, callbackUrl: "/home" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impersonation failed");
      setImpersonating(null);
    }
  }

  async function loadUserEmailConfig(userId: string) {
    setEmailConfigUserId(userId);
    setEmailConfigOpen(true);
    setUserEmailConfig(null);
    try {
      const res = await fetch(`/api/administration/users/${userId}/email-config`);
      if (!res.ok) throw new Error();
      const data = await res.json() as EmailConfigForm;
      setUserEmailConfig(data);
    } catch {
      toast.error("Failed to load email config");
      setUserEmailConfig(null);
    }
  }

  async function saveUserEmailConfig() {
    if (!emailConfigUserId || !userEmailConfig) return;
    setSavingEmailConfig(true);
    try {
      const res = await fetch(`/api/administration/users/${emailConfigUserId}/email-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userEmailConfig),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Email configuration saved");
      setEmailConfigOpen(false);
    } catch {
      toast.error("Failed to save email configuration");
    } finally {
      setSavingEmailConfig(false);
    }
  }

  async function generateInsight() {
    setInsightLoading(true);
    try {
      const response = await fetch("/api/administration/insights", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to generate AI insight");
      const data = (await response.json()) as AdminInsight;
      setInsight(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate AI insight");
    } finally {
      setInsightLoading(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading administration...</div>;

  return (
    <div className="flex h-full">
      <aside className="w-60 shrink-0 border-r bg-white p-3">
        <div className="mb-3 px-2"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Administration</p></div>
        {sectionItems.map((item) => (
          <button key={item.id} onClick={() => setSection(item.id)} className={cn("mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm", section === item.id ? "bg-[#AA8038]/10 text-[#AA8038]" : "text-slate-600 hover:bg-slate-100")}><item.icon className="h-4 w-4" />{item.label}</button>
        ))}
        <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void fetchAll()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
      </aside>
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="border-b bg-white px-5 py-3">
          <h1 className="text-xl font-semibold">Administration Control Center</h1>
          <p className="text-sm text-slate-500">Configure branding, module availability, access model, analytics, and governance logs.</p>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          {!canManage ? <p className="mt-2 text-sm text-amber-700">{sectionManageHint}</p> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {section === "overview" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Users</p><p className="text-2xl font-semibold">{users.length}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Active Users</p><p className="text-2xl font-semibold">{users.filter((u) => u.isActive).length}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Roles</p><p className="text-2xl font-semibold">{roles.length}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Enabled Modules</p><p className="text-2xl font-semibold">{moduleToggles.filter((module) => module.enabled).length}</p></CardContent></Card>
              </div>
              <Card><CardHeader><CardTitle className="flex items-center justify-between text-sm"><span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#AA8038]" />AI Insight</span><Button size="sm" variant="outline" onClick={() => void generateInsight()} disabled={insightLoading}>{insightLoading ? "Analyzing..." : "Generate"}</Button></CardTitle></CardHeader><CardContent className="text-sm">{!insight ? <p className="text-slate-500">Generate AI governance summary for current state.</p> : <><p>{insight.summary}</p><p className="mt-2 text-xs text-slate-400">Generated: {formatDateTime(insight.generatedAt, timezone)} ({timezone})</p></>}</CardContent></Card>
            </div>
          ) : null}

          {section === "settings" ? (
            <div className="space-y-4">
              {/* Compulsory Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    General Settings
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 uppercase tracking-wide">Required</span>
                  </CardTitle>
                  <p className="text-xs text-slate-500">These settings must be configured for the system to work correctly.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Application Name <span className="text-red-500">*</span></label>
                      <Input value={settingsForm.appName} onChange={(e) => setSettingsForm((prev) => ({ ...prev, appName: e.target.value }))} placeholder="e.g. DevotionDash" className={!settingsForm.appName.trim() ? "border-red-300 focus-visible:ring-red-300" : ""} />
                      {!settingsForm.appName.trim() && <p className="text-[11px] text-red-500">Application name is required</p>}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Tagline</label>
                      <Input value={settingsForm.appTagline} onChange={(e) => setSettingsForm((prev) => ({ ...prev, appTagline: e.target.value }))} placeholder="e.g. Your business workspace" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Support Email <span className="text-red-500">*</span></label>
                      <Input type="email" value={settingsForm.supportEmail} onChange={(e) => setSettingsForm((prev) => ({ ...prev, supportEmail: e.target.value }))} placeholder="support@company.com" className={!settingsForm.supportEmail.trim() ? "border-red-300 focus-visible:ring-red-300" : ""} />
                      {!settingsForm.supportEmail.trim() && <p className="text-[11px] text-red-500">Support email is required</p>}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Default Timezone <span className="text-red-500">*</span></label>
                      <Input value={settingsForm.defaultTimezone} onChange={(e) => setSettingsForm((prev) => ({ ...prev, defaultTimezone: e.target.value }))} placeholder="e.g. Asia/Dubai" className={!settingsForm.defaultTimezone.trim() ? "border-red-300 focus-visible:ring-red-300" : ""} />
                      {!settingsForm.defaultTimezone.trim() && <p className="text-[11px] text-red-500">Timezone is required</p>}
                      {settingsForm.defaultTimezone.trim() && (
                        <p className="text-[11px] text-slate-500">Preview: {formatDateTime(new Date().toISOString(), settingsForm.defaultTimezone || "UTC")}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">AI Model (Ollama)</label>
                      <Input value={settingsForm.aiModel} onChange={(e) => setSettingsForm((prev) => ({ ...prev, aiModel: e.target.value }))} placeholder="e.g. llama3" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Conversation Edit/Delete Window (minutes)</label>
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        value={settingsForm.conversationAuthorEditDeleteWindowMinutes}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            conversationAuthorEditDeleteWindowMinutes: normalizeConversationWindowMinutes(
                              e.target.value
                            ),
                          }))
                        }
                      />
                      <p className="text-[11px] text-slate-500">Comment authors can edit/delete only within this time window.</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => void saveSettings()} disabled={!canManage || saving || !settingsForm.appName.trim() || !settingsForm.supportEmail.trim() || !settingsForm.defaultTimezone.trim()}>
                      <Save className="mr-1.5 h-3.5 w-3.5" />Save General Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Theme Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Theme & Branding</CardTitle>
                  <p className="text-xs text-slate-500">Customize colors for the interface.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>App Logo</Label>
                    <div className="flex items-center gap-3">
                      {appLogoUrl ? (
                        <img src={appLogoUrl} alt="logo" className="h-10 w-10 rounded-lg border bg-white p-1 object-contain" />
                      ) : (
                        <img src="/logo.png" alt="logo" className="h-10 w-10 rounded-lg border bg-white p-1 object-contain" />
                      )}
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id="logo-upload"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const fd = new FormData();
                              fd.append("file", file);
                              const res = await fetch("/api/upload", { method: "POST", body: fd });
                              const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
                              if (!res.ok || !data?.url) {
                                toast.error(data?.error || "Logo upload failed.");
                                return;
                              }
                              setAppLogoUrl(data.url);
                              toast.success("Logo uploaded. Click Save Theme to persist.");
                            } catch {
                              toast.error("Logo upload failed.");
                            } finally {
                              e.currentTarget.value = "";
                            }
                          }}
                        />
                        <label htmlFor="logo-upload" className="cursor-pointer rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50">
                          Upload Logo
                        </label>
                        {appLogoUrl ? (
                          <button type="button" onClick={() => setAppLogoUrl("")} className="ml-2 text-xs text-red-500 hover:underline">
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">Recommended: square image, at least 72x72px. Supported: JPG, PNG, WEBP, GIF, SVG.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Primary Color</label>
                      <div className="flex gap-1.5">
                        <input type="color" value={settingsForm.themePrimary || "#AA8038"} onChange={(e) => setSettingsForm((prev) => ({ ...prev, themePrimary: e.target.value }))} className="h-9 w-10 cursor-pointer rounded border p-0.5" />
                        <Input value={settingsForm.themePrimary} onChange={(e) => setSettingsForm((prev) => ({ ...prev, themePrimary: e.target.value }))} placeholder="#AA8038" className="font-mono text-xs" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Sidebar From</label>
                      <div className="flex gap-1.5">
                        <input type="color" value={settingsForm.sidebarFrom || "#7B550D"} onChange={(e) => setSettingsForm((prev) => ({ ...prev, sidebarFrom: e.target.value }))} className="h-9 w-10 cursor-pointer rounded border p-0.5" />
                        <Input value={settingsForm.sidebarFrom} onChange={(e) => setSettingsForm((prev) => ({ ...prev, sidebarFrom: e.target.value }))} placeholder="#7B550D" className="font-mono text-xs" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Sidebar Mid</label>
                      <div className="flex gap-1.5">
                        <input type="color" value={settingsForm.sidebarMid || "#9B6B11"} onChange={(e) => setSettingsForm((prev) => ({ ...prev, sidebarMid: e.target.value }))} className="h-9 w-10 cursor-pointer rounded border p-0.5" />
                        <Input value={settingsForm.sidebarMid} onChange={(e) => setSettingsForm((prev) => ({ ...prev, sidebarMid: e.target.value }))} placeholder="#9B6B11" className="font-mono text-xs" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Sidebar To</label>
                      <div className="flex gap-1.5">
                        <input type="color" value={settingsForm.sidebarTo || "#6B4A0C"} onChange={(e) => setSettingsForm((prev) => ({ ...prev, sidebarTo: e.target.value }))} className="h-9 w-10 cursor-pointer rounded border p-0.5" />
                        <Input value={settingsForm.sidebarTo} onChange={(e) => setSettingsForm((prev) => ({ ...prev, sidebarTo: e.target.value }))} placeholder="#6B4A0C" className="font-mono text-xs" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Topbar From</label>
                      <div className="flex gap-1.5">
                        <input type="color" value={settingsForm.topbarFrom || "#C08312"} onChange={(e) => setSettingsForm((prev) => ({ ...prev, topbarFrom: e.target.value }))} className="h-9 w-10 cursor-pointer rounded border p-0.5" />
                        <Input value={settingsForm.topbarFrom} onChange={(e) => setSettingsForm((prev) => ({ ...prev, topbarFrom: e.target.value }))} placeholder="#C08312" className="font-mono text-xs" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Topbar Mid</label>
                      <div className="flex gap-1.5">
                        <input type="color" value={settingsForm.topbarMid || "#A5700E"} onChange={(e) => setSettingsForm((prev) => ({ ...prev, topbarMid: e.target.value }))} className="h-9 w-10 cursor-pointer rounded border p-0.5" />
                        <Input value={settingsForm.topbarMid} onChange={(e) => setSettingsForm((prev) => ({ ...prev, topbarMid: e.target.value }))} placeholder="#A5700E" className="font-mono text-xs" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Topbar To</label>
                      <div className="flex gap-1.5">
                        <input type="color" value={settingsForm.topbarTo || "#8B5F0C"} onChange={(e) => setSettingsForm((prev) => ({ ...prev, topbarTo: e.target.value }))} className="h-9 w-10 cursor-pointer rounded border p-0.5" />
                        <Input value={settingsForm.topbarTo} onChange={(e) => setSettingsForm((prev) => ({ ...prev, topbarTo: e.target.value }))} placeholder="#8B5F0C" className="font-mono text-xs" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Topbar Accent</label>
                      <div className="flex gap-1.5">
                        <input type="color" value={settingsForm.topbarAccent || "#FFC14D"} onChange={(e) => setSettingsForm((prev) => ({ ...prev, topbarAccent: e.target.value }))} className="h-9 w-10 cursor-pointer rounded border p-0.5" />
                        <Input value={settingsForm.topbarAccent} onChange={(e) => setSettingsForm((prev) => ({ ...prev, topbarAccent: e.target.value }))} placeholder="#FFC14D" className="font-mono text-xs" />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => void saveSettings()} disabled={!canManage || saving}>
                      <Save className="mr-1.5 h-3.5 w-3.5" />Save Theme
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => applyRuntimeTheme(settingsForm, appLogoUrl)}>Preview</Button>
                  </div>
                </CardContent>
              </Card>

              <ProjectFormBuilder canManage={canManage} />
            </div>
          ) : null}

          {section === "leadConfig" ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Lead Pipeline & Source Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pipeline Stages</p>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {leadConfigStageFlow.map((stage) => (
                        <div key={`lead-stage-${stage}`} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
                          <span>{stageToLabel(stage)}</span>
                          {stage !== "won" ? (
                            <button
                              type="button"
                              className="text-slate-400 hover:text-red-600"
                              onClick={() => removeLeadConfigStage(stage)}
                              disabled={!canManage}
                            >
                              x
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="h-9 max-w-xs"
                        value={leadConfigNewStage}
                        onChange={(event) => setLeadConfigNewStage(event.target.value)}
                        placeholder="Add stage (e.g. compliance_review)"
                        disabled={!canManage}
                      />
                      <Button
                        variant="outline"
                        className="h-9"
                        onClick={addLeadConfigStage}
                        disabled={!canManage}
                      >
                        Add Stage
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md border p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Lead Source Options</p>
                    <Textarea
                      rows={6}
                      value={leadConfigSourceText}
                      onChange={(event) => setLeadConfigSourceText(event.target.value)}
                      placeholder="One source per line"
                      disabled={!canManage}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">New Lead Form Field Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Configure field label, placeholder, visibility, required status, and order for the lead creation form.
                  </p>
                  <div className="max-h-[520px] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead>Label</TableHead>
                          <TableHead>Placeholder</TableHead>
                          <TableHead className="w-20">Enabled</TableHead>
                          <TableHead className="w-20">Required</TableHead>
                          <TableHead className="w-20">Order</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...leadConfigFormFields]
                          .sort((a, b) => a.order - b.order)
                          .map((field) => {
                            const locked = field.id === "title" || field.id === "companyName";
                            return (
                              <TableRow key={`lead-field-${field.id}`}>
                                <TableCell className="text-xs font-medium">{field.id}</TableCell>
                                <TableCell>
                                  <Input
                                    value={field.label}
                                    onChange={(event) =>
                                      updateLeadConfigField(field.id, { label: event.target.value })
                                    }
                                    className="h-8 min-w-[160px]"
                                    disabled={!canManage}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={field.placeholder}
                                    onChange={(event) =>
                                      updateLeadConfigField(field.id, { placeholder: event.target.value })
                                    }
                                    className="h-8 min-w-[200px]"
                                    disabled={!canManage}
                                  />
                                </TableCell>
                                <TableCell>
                                  <input
                                    type="checkbox"
                                    checked={field.enabled}
                                    disabled={!canManage || locked}
                                    onChange={(event) =>
                                      updateLeadConfigField(field.id, { enabled: event.target.checked })
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <input
                                    type="checkbox"
                                    checked={field.required}
                                    disabled={!canManage || locked || !field.enabled}
                                    onChange={(event) =>
                                      updateLeadConfigField(field.id, { required: event.target.checked })
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={1000}
                                    value={field.order}
                                    onChange={(event) =>
                                      updateLeadConfigField(field.id, {
                                        order: Number.parseInt(event.target.value || "1", 10),
                                      })
                                    }
                                    className="h-8 w-20"
                                    disabled={!canManage}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => void saveLeadConfig()}
                      disabled={!canManage || leadConfigSaving}
                    >
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      {leadConfigSaving ? "Saving..." : "Save Lead Configuration"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Custom Fields */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">Custom Lead Fields</CardTitle>
                      <p className="mt-0.5 text-xs text-slate-500">Add custom fields that appear in the lead creation and edit forms.</p>
                    </div>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setNewCustomField({ open: true, type: "text", label: "", placeholder: "", required: false, options: "" })}
                      >
                        + Add Field
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {leadConfigCustomFields.length === 0 && !newCustomField.open && (
                    <p className="rounded-md border border-dashed p-4 text-center text-sm text-slate-400">
                      No custom fields yet. Click &quot;Add Field&quot; to create one.
                    </p>
                  )}

                  {/* Existing custom fields list */}
                  {leadConfigCustomFields.map((field) => (
                    <div key={field.id} className="rounded-lg border bg-slate-50 p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn(
                          "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
                          field.type === "text" ? "bg-blue-100 text-blue-700" :
                          field.type === "textarea" ? "bg-purple-100 text-purple-700" :
                          field.type === "number" ? "bg-green-100 text-green-700" :
                          field.type === "checkbox" ? "bg-orange-100 text-orange-700" :
                          field.type === "dropdown" ? "bg-indigo-100 text-indigo-700" :
                          "bg-pink-100 text-pink-700"
                        )}>{field.type}</span>
                        <Input
                          className="h-8 flex-1 min-w-[160px] text-sm"
                          value={field.label}
                          placeholder="Field label"
                          disabled={!canManage}
                          onChange={(e) => setLeadConfigCustomFields((prev) =>
                            prev.map((f) => f.id === field.id ? { ...f, label: e.target.value } : f)
                          )}
                        />
                        <select
                          className="h-8 rounded-md border bg-white px-2 text-sm"
                          value={field.type}
                          disabled={!canManage}
                          onChange={(e) => setLeadConfigCustomFields((prev) =>
                            prev.map((f) => f.id === field.id ? { ...f, type: e.target.value as LeadCustomFieldType, options: [] } : f)
                          )}
                        >
                          <option value="text">Text</option>
                          <option value="textarea">Textarea</option>
                          <option value="number">Number</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="dropdown">Dropdown</option>
                          <option value="date">Date</option>
                        </select>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={field.enabled}
                            disabled={!canManage}
                            onChange={(e) => setLeadConfigCustomFields((prev) =>
                              prev.map((f) => f.id === field.id ? { ...f, enabled: e.target.checked, required: e.target.checked ? f.required : false } : f)
                            )}
                          />
                          Enabled
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={field.required}
                            disabled={!canManage || !field.enabled}
                            onChange={(e) => setLeadConfigCustomFields((prev) =>
                              prev.map((f) => f.id === field.id ? { ...f, required: e.target.checked } : f)
                            )}
                          />
                          Required
                        </label>
                        <div className="flex items-center gap-1 text-xs text-slate-600">
                          <span>Order</span>
                          <Input
                            type="number"
                            min={1}
                            max={9999}
                            className="h-8 w-16 text-sm"
                            value={field.order}
                            disabled={!canManage}
                            onChange={(e) => setLeadConfigCustomFields((prev) =>
                              prev.map((f) => f.id === field.id ? { ...f, order: parseInt(e.target.value || "1", 10) || 1 } : f)
                            )}
                          />
                        </div>
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              if (!window.confirm(`Delete custom field "${field.label}"?`)) return;
                              setLeadConfigCustomFields((prev) => prev.filter((f) => f.id !== field.id));
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                      {field.type !== "checkbox" && (
                        <Input
                          className="h-8 text-sm"
                          value={field.placeholder}
                          placeholder="Placeholder text (optional)"
                          disabled={!canManage}
                          onChange={(e) => setLeadConfigCustomFields((prev) =>
                            prev.map((f) => f.id === field.id ? { ...f, placeholder: e.target.value } : f)
                          )}
                        />
                      )}
                      {field.type === "dropdown" && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-slate-600">Dropdown Options <span className="text-slate-400">(one per line)</span></p>
                          <Textarea
                            rows={3}
                            className="text-sm resize-none"
                            value={field.options.join("\n")}
                            placeholder="Option 1&#10;Option 2&#10;Option 3"
                            disabled={!canManage}
                            onChange={(e) => setLeadConfigCustomFields((prev) =>
                              prev.map((f) => f.id === field.id
                                ? { ...f, options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) }
                                : f
                              )
                            )}
                          />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add new custom field form */}
                  {newCustomField.open && (
                    <div className="rounded-lg border-2 border-dashed border-[#AA8038]/30 bg-red-50/30 p-3 space-y-2">
                      <p className="text-xs font-semibold text-slate-700">New Custom Field</p>
                      <div className="flex flex-wrap gap-2">
                        <select
                          className="h-9 rounded-md border bg-white px-2 text-sm"
                          value={newCustomField.type}
                          onChange={(e) => setNewCustomField((f) => ({ ...f, type: e.target.value as LeadCustomFieldType, options: "" }))}
                        >
                          <option value="text">Text</option>
                          <option value="textarea">Textarea</option>
                          <option value="number">Number</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="dropdown">Dropdown</option>
                          <option value="date">Date</option>
                        </select>
                        <Input
                          className="h-9 flex-1 min-w-[180px] text-sm"
                          value={newCustomField.label}
                          onChange={(e) => setNewCustomField((f) => ({ ...f, label: e.target.value }))}
                          placeholder="Field label (e.g. Budget Range) *"
                        />
                        {newCustomField.type !== "checkbox" && (
                          <Input
                            className="h-9 flex-1 min-w-[160px] text-sm"
                            value={newCustomField.placeholder}
                            onChange={(e) => setNewCustomField((f) => ({ ...f, placeholder: e.target.value }))}
                            placeholder="Placeholder text"
                          />
                        )}
                        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newCustomField.required}
                            onChange={(e) => setNewCustomField((f) => ({ ...f, required: e.target.checked }))}
                          />
                          Required
                        </label>
                      </div>
                      {newCustomField.type === "dropdown" && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-slate-600">Options <span className="text-slate-400">(one per line)</span></p>
                          <Textarea
                            rows={3}
                            className="text-sm resize-none"
                            value={newCustomField.options}
                            onChange={(e) => setNewCustomField((f) => ({ ...f, options: e.target.value }))}
                            placeholder="Option 1&#10;Option 2&#10;Option 3"
                          />
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="bg-[#AA8038] text-white hover:bg-[#D98D00]"
                          onClick={() => {
                            const label = newCustomField.label.trim();
                            if (!label) { setError("Field label is required"); return; }
                            const id = `cf_${Date.now()}`;
                            const maxOrder = Math.max(0, ...leadConfigCustomFields.map((f) => f.order));
                            const options = newCustomField.type === "dropdown"
                              ? newCustomField.options.split("\n").map((o) => o.trim()).filter(Boolean)
                              : [];
                            setLeadConfigCustomFields((prev) => [
                              ...prev,
                              {
                                id,
                                type: newCustomField.type,
                                label,
                                enabled: true,
                                required: newCustomField.required,
                                order: maxOrder + 1,
                                placeholder: newCustomField.placeholder.trim(),
                                options,
                              },
                            ]);
                            setNewCustomField({ open: false, type: "text", label: "", placeholder: "", required: false, options: "" });
                            setError(null);
                          }}
                        >
                          Add Field
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setNewCustomField({ open: false, type: "text", label: "", placeholder: "", required: false, options: "" })}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      onClick={() => void saveLeadConfig()}
                      disabled={!canManage || leadConfigSaving}
                    >
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      {leadConfigSaving ? "Saving..." : "Save Custom Fields"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {section === "workflowConfig" ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Workflow Stages</h2>
                <Button onClick={() => void saveWorkflowConfig()} disabled={!canManage || savingWorkflow} className="bg-[#AA8038] text-white hover:bg-[#CC8500]">
                  {savingWorkflow ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </div>

              <div className="flex gap-2 border-b">
                {(["tasks", "servicedesk", "projectTasks"] as const).map((m) => (
                  <button key={m} onClick={() => setActiveWorkflowModule(m)}
                    className={cn("px-4 py-2 text-sm border-b-2 -mb-px", activeWorkflowModule === m ? "border-[#AA8038] text-[#AA8038] font-medium" : "border-transparent text-slate-600 hover:text-slate-900")}>
                    {m === "tasks" ? "Tasks" : m === "servicedesk" ? "Ticket Desk" : "Project Tasks"}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {workflowConfig[activeWorkflowModule].map((stage, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-lg border bg-white p-3">
                    <input type="color" value={stage.color} onChange={(e) => updateWorkflowStage(activeWorkflowModule, idx, { color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border p-0.5" disabled={!canManage} />
                    <Input value={stage.label} onChange={(e) => updateWorkflowStage(activeWorkflowModule, idx, { label: e.target.value })} className="h-8 w-40 text-sm" placeholder="Stage label" disabled={!canManage} />
                    <Input value={stage.key} onChange={(e) => updateWorkflowStage(activeWorkflowModule, idx, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} className="h-8 w-36 font-mono text-xs text-slate-500" placeholder="key" disabled={!canManage} />
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={stage.isClosed} onChange={(e) => updateWorkflowStage(activeWorkflowModule, idx, { isClosed: e.target.checked })} disabled={!canManage} />
                      Closed
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="radio" name={`default-${activeWorkflowModule}`} checked={stage.isDefault} onChange={() => updateWorkflowStage(activeWorkflowModule, idx, { isDefault: true })} disabled={!canManage} />
                      Default
                    </label>
                    <button onClick={() => removeWorkflowStage(activeWorkflowModule, idx)} className="ml-auto rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" disabled={!canManage || workflowConfig[activeWorkflowModule].length <= 1}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addWorkflowStage(activeWorkflowModule)} disabled={!canManage}>
                  <Plus className="h-4 w-4 mr-1" /> Add Stage
                </Button>
              </div>
            </div>
          ) : null}

          {section === "livechat" ? (
            <div className="space-y-5">
              {/* ── Automation Settings ── */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <MessageSquare className="h-4 w-4 text-[#AA8038]" />
                    Automation Settings
                  </CardTitle>
                  <p className="text-xs text-slate-500">Routing strategy, load limits, AI, translator, and auto-close behaviour.</p>
                </CardHeader>
                <CardContent>
                  {lcAutomationLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Auto Assignment</Label>
                          <select className="h-9 w-full rounded-md border px-3 text-sm" value={lcAutomation.autoAssignEnabled ? "on" : "off"} onChange={(e) => setLcAutomation((p) => ({ ...p, autoAssignEnabled: e.target.value === "on" }))}>
                            <option value="on">Enabled</option><option value="off">Disabled</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Routing Strategy</Label>
                          <select className="h-9 w-full rounded-md border px-3 text-sm" value={lcAutomation.routingStrategy} onChange={(e) => setLcAutomation((p) => ({ ...p, routingStrategy: e.target.value === "round_robin" ? "round_robin" : "least_loaded" }))}>
                            <option value="least_loaded">Least Loaded</option><option value="round_robin">Round Robin</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Max Open Chats per Agent</Label>
                          <Input type="number" min={1} max={100} className="h-9" value={lcAutomation.maxOpenPerAgent} onChange={(e) => setLcAutomation((p) => ({ ...p, maxOpenPerAgent: Math.min(100, Math.max(1, parseInt(e.target.value || "1", 10) || 1)) }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">AI Insights</Label>
                          <select className="h-9 w-full rounded-md border px-3 text-sm" value={lcAutomation.aiInsightsEnabled ? "on" : "off"} onChange={(e) => setLcAutomation((p) => ({ ...p, aiInsightsEnabled: e.target.value === "on" }))}>
                            <option value="on">Enabled</option><option value="off">Disabled</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Translator</Label>
                          <select className="h-9 w-full rounded-md border px-3 text-sm" value={lcAutomation.translatorEnabled ? "on" : "off"} onChange={(e) => setLcAutomation((p) => ({ ...p, translatorEnabled: e.target.value === "on" }))}>
                            <option value="on">Enabled</option><option value="off">Disabled</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Source Lang</Label>
                            <Input className="h-9" value={lcAutomation.translatorSourceLang} onChange={(e) => setLcAutomation((p) => ({ ...p, translatorSourceLang: e.target.value }))} placeholder="auto" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Target Lang</Label>
                            <Input className="h-9" value={lcAutomation.translatorTargetLang} onChange={(e) => setLcAutomation((p) => ({ ...p, translatorTargetLang: e.target.value }))} placeholder="en" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Auto-Close Idle Chats</Label>
                          <select className="h-9 w-full rounded-md border px-3 text-sm" value={lcAutomation.autoCloseEnabled ? "on" : "off"} onChange={(e) => setLcAutomation((p) => ({ ...p, autoCloseEnabled: e.target.value === "on" }))}>
                            <option value="on">Enabled</option><option value="off">Disabled</option>
                          </select>
                        </div>
                        {lcAutomation.autoCloseEnabled ? (
                          <div className="space-y-1.5">
                            <Label className="text-xs">Idle Timeout (minutes)</Label>
                            <Input type="number" min={5} max={1440} className="h-9" value={lcAutomation.autoCloseMinutes} onChange={(e) => setLcAutomation((p) => ({ ...p, autoCloseMinutes: Math.min(1440, Math.max(5, parseInt(e.target.value || "120", 10) || 120)) }))} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                  <div className="mt-4">
                    <Button size="sm" className="bg-[#AA8038] text-white hover:bg-[#D48A00]" onClick={() => void saveLcAutomation()} disabled={lcAutomationSaving || !canManage}>
                      {lcAutomationSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                      Save Automation Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* ── Per-Website Widgets ── */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Globe className="h-4 w-4 text-[#AA8038]" />
                        Chat Widgets
                      </CardTitle>
                      <p className="text-xs text-slate-500 mt-0.5">One widget per website. Each has its own token, branding, and domain allowlist.</p>
                    </div>
                    {canManage ? (
                      <Button size="sm" className="h-8 bg-[#AA8038] text-white hover:bg-[#D48A00]" onClick={() => { setLcWidgetEditing(null); setLcWidgetForm(EMPTY_WIDGET_FORM); setLcWidgetDialogOpen(true); }}>
                        <Plus className="mr-1 h-3.5 w-3.5" />Add Widget
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  {lcWidgetsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading widgets...</div>
                  ) : lcWidgets.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">No widgets yet. Add one for each website you want to embed the chat on.</p>
                  ) : (
                    <div className="space-y-3">
                      {lcWidgets.map((w) => (
                        <div key={w.id} className="rounded-lg border bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-800">{w.name}</span>
                                <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", w.enabled ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-500")}>
                                  {w.enabled ? "Active" : "Disabled"}
                                </Badge>
                              </div>
                              {w.domain ? <p className="mt-0.5 text-xs text-slate-500">{w.domain}</p> : null}
                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                                <span className="flex items-center gap-1">
                                  <span className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: w.accentColor }} />
                                  {w.brandLabel}
                                </span>
                                <span>Position: {w.position}</span>
                                <span className="font-mono text-slate-400">{w.token.slice(0, 12)}…</span>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                title={lcWidgetCopied === w.id ? "Copied!" : "Copy embed script"}
                                onClick={() => void copyWidgetScript(w)}
                                className="rounded border p-1.5 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                title="Edit widget"
                                onClick={() => {
                                  setLcWidgetEditing(w);
                                  setLcWidgetForm({
                                    name: w.name, domain: w.domain ?? "", enabled: w.enabled,
                                    brandLabel: w.brandLabel, logoUrl: w.logoUrl ?? "",
                                    welcomeText: w.welcomeText, accentColor: w.accentColor,
                                    position: w.position === "left" ? "left" : "right",
                                    allowDomains: w.allowDomains ?? "",
                                  });
                                  setLcWidgetDialogOpen(true);
                                }}
                                className="rounded border p-1.5 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                title="Rotate token"
                                onClick={() => void rotateLcWidgetToken(w.id)}
                                className="rounded border p-1.5 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </button>
                              <button
                                title="Delete widget"
                                disabled={lcWidgetDeleting === w.id}
                                onClick={() => void deleteLcWidget(w.id)}
                                className="rounded border p-1.5 text-red-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                              >
                                {lcWidgetDeleting === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>
                          {lcWidgetCopied === w.id ? (
                            <p className="mt-2 text-xs text-green-600">Embed script copied to clipboard!</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Widget create/edit dialog ── */}
              <Dialog open={lcWidgetDialogOpen} onOpenChange={(open) => { if (!open) { setLcWidgetDialogOpen(false); setLcWidgetEditing(null); } }}>
                <DialogContent className="sm:max-w-[600px]">
                  <DialogHeader>
                    <DialogTitle>{lcWidgetEditing ? "Edit Widget" : "New Chat Widget"}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Widget Name *</Label>
                        <Input value={lcWidgetForm.name} onChange={(e) => setLcWidgetForm((p) => ({ ...p, name: e.target.value }))} placeholder="My Website" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Website Domain</Label>
                        <Input value={lcWidgetForm.domain} onChange={(e) => setLcWidgetForm((p) => ({ ...p, domain: e.target.value }))} placeholder="example.com" />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Brand Label</Label>
                        <Input value={lcWidgetForm.brandLabel} onChange={(e) => setLcWidgetForm((p) => ({ ...p, brandLabel: e.target.value }))} placeholder="Chat with us" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Logo URL (optional)</Label>
                        <Input value={lcWidgetForm.logoUrl} onChange={(e) => setLcWidgetForm((p) => ({ ...p, logoUrl: e.target.value }))} placeholder="https://…/logo.png" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Welcome Message</Label>
                      <Input value={lcWidgetForm.welcomeText} onChange={(e) => setLcWidgetForm((p) => ({ ...p, welcomeText: e.target.value }))} placeholder="Hi! How can we help?" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Accent Color</Label>
                        <div className="flex gap-2">
                          <input type="color" value={lcWidgetForm.accentColor} onChange={(e) => setLcWidgetForm((p) => ({ ...p, accentColor: e.target.value }))} className="h-9 w-12 cursor-pointer rounded border p-1" />
                          <Input value={lcWidgetForm.accentColor} onChange={(e) => setLcWidgetForm((p) => ({ ...p, accentColor: e.target.value }))} className="h-9 font-mono text-xs" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Position</Label>
                        <select className="h-9 w-full rounded-md border px-3 text-sm" value={lcWidgetForm.position} onChange={(e) => setLcWidgetForm((p) => ({ ...p, position: e.target.value === "left" ? "left" : "right" }))}>
                          <option value="right">Right</option><option value="left">Left</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Status</Label>
                        <select className="h-9 w-full rounded-md border px-3 text-sm" value={lcWidgetForm.enabled ? "on" : "off"} onChange={(e) => setLcWidgetForm((p) => ({ ...p, enabled: e.target.value === "on" }))}>
                          <option value="on">Active</option><option value="off">Disabled</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Allowed Domains (one per line, leave empty for open access)</Label>
                      <textarea
                        dir="ltr"
                        rows={3}
                        value={lcWidgetForm.allowDomains}
                        onChange={(e) => setLcWidgetForm((p) => ({ ...p, allowDomains: e.target.value }))}
                        placeholder={"example.com\n*.example.com\nlocalhost"}
                        className="w-full resize-none rounded-md border px-3 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-[#AA8038]/30"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setLcWidgetDialogOpen(false)} disabled={lcWidgetSaving}>Cancel</Button>
                    <Button className="bg-[#AA8038] text-white hover:bg-[#D48A00]" onClick={() => void saveLcWidget()} disabled={lcWidgetSaving || !lcWidgetForm.name.trim()}>
                      {lcWidgetSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                      {lcWidgetEditing ? "Save Changes" : "Create Widget"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : null}

          {section === "modules" ? (
            <Card><CardHeader><CardTitle className="text-sm">Module Toggles</CardTitle></CardHeader><CardContent className="space-y-2">{moduleToggles.map((moduleItem) => (<label key={moduleItem.id} className="flex items-center justify-between rounded-md border px-3 py-2"><span className="text-sm">{moduleLabels[moduleItem.id]}</span><div className="flex items-center gap-2">{moduleItem.locked ? <Badge variant="outline" className="text-xs">Locked</Badge> : null}<input type="checkbox" checked={moduleItem.enabled} disabled={!canManage || moduleItem.locked} onChange={(e) => setModuleToggles((prev) => prev.map((item) => item.id === moduleItem.id ? { ...item, enabled: e.target.checked } : item))} /></div></label>))}<Button size="sm" onClick={() => void saveModuleToggles()} disabled={!canManage || saving}><Save className="mr-1.5 h-3.5 w-3.5" />Save Module Toggles</Button></CardContent></Card>
          ) : null}

          {section === "users" ? (
            <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>Users</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      onClick={() => setCreateUserOpen(true)}
                      disabled={!canManage}
                    >
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                      Add User
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search users..." />
                  <div className="flex items-center justify-between rounded-md border bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      Departments: {departments.length}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={openDepartmentDialog}
                      disabled={!canManage}
                    >
                      Manage
                    </Button>
                  </div>
                  <ScrollArea className="h-[520px]">
                    {filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        className={cn(
                          "mb-1 w-full rounded-md border px-3 py-2 text-left",
                          selectedUserId === user.id ? "border-[#AA8038]/20 bg-[#AA8038]/10" : "hover:bg-slate-50"
                        )}
                      >
                        <button
                          className="w-full text-left"
                          onClick={() => {
                            setSelectedUserId(user.id);
                            setSelectedUserRoleIds(user.roles.map((role) => role.id));
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">{user.fullname || `${user.name} ${user.surname}`.trim()}</p>
                            <Badge variant={user.isActive ? "secondary" : "outline"} className="text-[10px]">
                              {user.isActive ? "Active" : "Disabled"}
                            </Badge>
                          </div>
                          <p className="truncate text-xs text-slate-500">{user.login} - {user.department || "-"}</p>
                        </button>
                        <div className="mt-1.5 flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={!canManage || impersonating === user.id}
                            onClick={() => void handleImpersonate(user.id)}
                          >
                            {impersonating === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                            <span className="ml-1">{impersonating === user.id ? "..." : "Login As"}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={!canManage}
                            onClick={() => void loadUserEmailConfig(user.id)}
                          >
                            <Mail className="h-3 w-3 mr-1" />
                            Email
                          </Button>
                        </div>
                      </div>
                    ))}
                  </ScrollArea>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">User Management</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!selectedUser ? (
                      <p className="text-sm text-slate-500">Select a user.</p>
                    ) : (
                      <>
                        <div className="rounded-md border bg-slate-50 p-3">
                          <p className="text-sm font-medium">{selectedUser.fullname || `${selectedUser.name} ${selectedUser.surname}`.trim()}</p>
                          <p className="text-xs text-slate-600">{selectedUser.email}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Last activity: {formatDateTime(selectedUser.lastActivity ?? null, timezone)}
                          </p>
                          <p className="text-xs text-slate-500">
                            Joined: {formatDateTime(selectedUser.createdAt ?? null, timezone)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            className={selectedUser.isActive ? "bg-[#AA8038]/15 text-[#7B5B1D] hover:bg-[#AA8038]/25" : ""}
                            onClick={() => void updateSelectedUser({ isActive: !selectedUser.isActive })}
                            disabled={!canManage || userActionSaving}
                          >
                            {selectedUser.isActive ? "Disable User" : "Enable User"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void updateSelectedUser({ isAdmin: !selectedUser.isAdmin })}
                            disabled={!canManage || userActionSaving}
                          >
                            {selectedUser.isAdmin ? "Remove Admin" : "Make Admin"}
                          </Button>
                          <select
                            className="h-9 rounded-md border px-2 text-sm"
                            value={String(selectedUser.workState ?? 1)}
                            disabled={!canManage || userActionSaving}
                            onChange={(event) => {
                              const nextWorkState = Number(event.target.value);
                              if (Number.isFinite(nextWorkState)) void updateSelectedUser({ workState: nextWorkState });
                            }}
                          >
                            <option value="1">Work State: Available</option>
                            <option value="2">Work State: Away</option>
                            <option value="0">Work State: Offline</option>
                          </select>
                          <select
                            className="h-9 min-w-[180px] rounded-md border px-2 text-sm"
                            value={selectedUser.department || ""}
                            disabled={!canManage || userActionSaving}
                            onChange={(event) => void updateSelectedUser({ department: event.target.value })}
                          >
                            <option value="">Department: Unassigned</option>
                            {departments
                              .filter((department) => department.isActive || department.name === selectedUser.department)
                              .map((department) => (
                                <option key={`dept-user-${department.id}`} value={department.name}>
                                  Department: {department.name}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="rounded-md border p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Change Password</p>
                          <div className="flex flex-wrap gap-2">
                            <Input
                              type="text"
                              placeholder="New password (min 8 chars)"
                              value={userPassword}
                              onChange={(event) => setUserPassword(event.target.value)}
                              className="min-w-[260px] flex-1"
                              disabled={!canManage || userActionSaving}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setUserPassword(generateStrongPassword())}
                              disabled={!canManage || userActionSaving}
                            >
                              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                              Generate
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => void saveSelectedUserPassword()}
                              disabled={!canManage || userActionSaving || userPassword.trim().length < 8}
                            >
                              Update Password
                            </Button>
                          </div>
                        </div>

                        <div className="rounded-md border p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Two-step Verification</p>
                          {userTwoFactorLoading ? (
                            <p className="text-xs text-slate-500">Loading 2-step status...</p>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={selectedUserTwoFactor?.enabled ? "secondary" : "outline"} className="text-xs">
                                  {selectedUserTwoFactor?.enabled ? "Enabled" : "Disabled"}
                                </Badge>
                                <span className="text-xs text-slate-500">
                                  Backup codes left: {selectedUserTwoFactor?.backupCodesRemaining ?? 0}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void manageSelectedUserTwoFactor("enable")}
                                  disabled={!canManage || userTwoFactorSaving}
                                >
                                  Enable
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void manageSelectedUserTwoFactor("rotate")}
                                  disabled={!canManage || userTwoFactorSaving || !selectedUserTwoFactor?.enabled}
                                >
                                  Rotate Secret
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void manageSelectedUserTwoFactor("backup")}
                                  disabled={!canManage || userTwoFactorSaving || !selectedUserTwoFactor?.enabled}
                                >
                                  New Backup Codes
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => void manageSelectedUserTwoFactor("disable")}
                                  disabled={!canManage || userTwoFactorSaving || !selectedUserTwoFactor?.enabled}
                                >
                                  Disable
                                </Button>
                              </div>
                              {userTwoFactorSetup ? (
                                <div className="mt-3 rounded-md border bg-slate-50 p-3">
                                  <p className="text-xs font-semibold text-slate-700">Google Authenticator Setup (share securely)</p>
                                  <p className="mt-1 text-xs text-slate-600">
                                    Open Google Authenticator, tap <span className="font-medium">+</span>, then scan QR or enter setup key manually.
                                  </p>
                                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
                                    <div className="rounded-md border bg-white p-2">
                                      <img
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(userTwoFactorSetup.otpAuthUri)}`}
                                        alt="Google Authenticator QR"
                                        className="h-[180px] w-[180px]"
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-2">
                                      <p className="break-all text-xs text-slate-600">Secret: {userTwoFactorSetup.secret}</p>
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={async () => {
                                            try {
                                              await navigator.clipboard.writeText(userTwoFactorSetup.secret);
                                            } catch {
                                              setError("Unable to copy secret. Please copy manually.");
                                            }
                                          }}
                                        >
                                          Copy Secret
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={async () => {
                                            try {
                                              await navigator.clipboard.writeText(userTwoFactorSetup.otpAuthUri);
                                            } catch {
                                              setError("Unable to copy OTP URI. Please copy manually.");
                                            }
                                          }}
                                        >
                                          Copy OTP URI
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                  {userTwoFactorSetup.backupCodes.length > 0 ? (
                                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                                      {userTwoFactorSetup.backupCodes.map((code) => (
                                        <code key={code} className="rounded border bg-white px-2 py-1 text-[11px] text-slate-700">{code}</code>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>

                        <div className="rounded-md border p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Role Assignment</p>
                          <div className="space-y-1">
                            {roles.map((role) => (
                              <label key={role.id} className="flex items-center justify-between rounded border px-2 py-1.5 text-sm">
                                <span>{role.name}</span>
                                <input
                                  type="checkbox"
                                  checked={selectedUserRoleIds.includes(role.id)}
                                  disabled={!canManage}
                                  onChange={(e) =>
                                    setSelectedUserRoleIds((prev) =>
                                      e.target.checked ? Array.from(new Set([...prev, role.id])) : prev.filter((id) => id !== role.id)
                                    )
                                  }
                                />
                              </label>
                            ))}
                          </div>
                          <Button size="sm" variant="outline" className="mt-2" onClick={() => void saveUserRoles()} disabled={!canManage || saving}>
                            Save Roles
                          </Button>
                        </div>

                        <div className="rounded-md border p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Direct Permissions</p>
                          {selectedUser.isAdmin ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                                <span className="text-sm">👑</span>
                                <div>
                                  <p className="text-xs font-semibold text-amber-800">Super Admin — Full Access</p>
                                  <p className="text-[11px] text-amber-600">This account has unrestricted access to all modules. Permissions cannot be modified.</p>
                                </div>
                              </div>
                              <div className="max-h-56 overflow-auto border rounded opacity-60 pointer-events-none">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Module</TableHead>
                                      <TableHead>R</TableHead>
                                      <TableHead>W</TableHead>
                                      <TableHead>M</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {moduleIds.map((moduleId) => (
                                      <TableRow key={moduleId}>
                                        <TableCell className="text-xs">{moduleLabels[moduleId]}</TableCell>
                                        {actions.map((action) => (
                                          <TableCell key={`${moduleId}-${action}`}>
                                            <input type="checkbox" checked readOnly disabled />
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-[11px] text-slate-500">
                                  `Replace` mode is strict and blocks role leaks for unchecked modules.
                                </p>
                                <select
                                  className="h-8 rounded-md border px-2 text-xs"
                                  value={selectedUserGrantMode}
                                  disabled={!canManage}
                                  onChange={(event) =>
                                    setSelectedUserGrantMode(
                                      event.target.value === "merge" ? "merge" : "replace"
                                    )
                                  }
                                >
                                  <option value="replace">Replace (Strict)</option>
                                  <option value="merge">Merge (Additive)</option>
                                </select>
                              </div>
                              <div className="max-h-56 overflow-auto border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Module</TableHead>
                                      <TableHead>R</TableHead>
                                      <TableHead>W</TableHead>
                                      <TableHead>M</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {moduleIds.map((moduleId) => (
                                      <TableRow key={moduleId}>
                                        <TableCell className="text-xs">{moduleLabels[moduleId]}</TableCell>
                                        {actions.map((action) => (
                                          <TableCell key={`${moduleId}-${action}`}>
                                            <input
                                              type="checkbox"
                                              checked={(selectedUserGrants[moduleId] ?? []).includes(action)}
                                              disabled={!canManage}
                                              onChange={(e) => {
                                                const next = clonePermissions(selectedUserGrants);
                                                applyAction(next, moduleId, action, e.target.checked);
                                                setSelectedUserGrants(next);
                                              }}
                                            />
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                              <Button size="sm" className="mt-2" onClick={() => void saveUserGrants()} disabled={!canManage || saving}>
                                Save Direct Permissions
                              </Button>
                            </>
                          )}
                        </div>

                        <div className="rounded-md border p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">User Logs</p>
                            <Button size="sm" variant="outline" onClick={() => selectedUserId && void loadUserLogs(selectedUserId)} disabled={userLogsLoading}>
                              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                              Refresh
                            </Button>
                          </div>
                          <div className="max-h-52 overflow-auto border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Time</TableHead>
                                  <TableHead>Action</TableHead>
                                  <TableHead>Module</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {userLogsLoading ? (
                                  <TableRow>
                                    <TableCell className="text-xs text-slate-500" colSpan={3}>
                                      Loading logs...
                                    </TableCell>
                                  </TableRow>
                                ) : userLogs.length === 0 ? (
                                  <TableRow>
                                    <TableCell className="text-xs text-slate-500" colSpan={3}>
                                      No logs found.
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  userLogs.map((log) => (
                                    <TableRow key={log.id}>
                                      <TableCell className="text-xs">{formatDateTime(log.createdAt, timezone)}</TableCell>
                                      <TableCell className="text-xs">{log.action}</TableCell>
                                      <TableCell className="text-xs">{log.module}</TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}

          {section === "roles" ? (
            <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">Roles</CardTitle></CardHeader><CardContent className="space-y-1">{roles.map((role) => (<button key={role.id} onClick={() => { setSelectedRoleId(role.id); setRoleName(role.name); setRoleColor(role.color); setRolePermissions(clonePermissions(role.permissions)); }} className={cn("w-full rounded-md border px-3 py-2 text-left", selectedRoleId === role.id ? "border-[#AA8038]/30 bg-[#AA8038]/10" : "hover:bg-slate-50")}><p className="text-sm font-medium">{role.name}</p><p className="text-xs text-slate-500">{role.memberCount} members</p></button>))}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Role Editor</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="Role name" /><Input value={roleColor} onChange={(e) => setRoleColor(e.target.value)} placeholder="#3B4A61" /><div className="max-h-64 overflow-auto border"><Table><TableHeader><TableRow><TableHead>Module</TableHead><TableHead>R</TableHead><TableHead>W</TableHead><TableHead>M</TableHead></TableRow></TableHeader><TableBody>{moduleIds.map((moduleId) => (<TableRow key={`role-${moduleId}`}><TableCell className="text-xs">{moduleLabels[moduleId]}</TableCell>{actions.map((action) => (<TableCell key={`role-${moduleId}-${action}`}><input type="checkbox" checked={(rolePermissions[moduleId] ?? []).includes(action)} disabled={!canManage} onChange={(e) => { const next = clonePermissions(rolePermissions); applyAction(next, moduleId, action, e.target.checked); setRolePermissions(next); }} /></TableCell>))}</TableRow>))}</TableBody></Table></div><div className="flex gap-2"><Button size="sm" onClick={() => void createRole()} disabled={!canManage || saving}>Create</Button><Button size="sm" variant="outline" onClick={() => void updateRole()} disabled={!canManage || saving || !selectedRoleId}>Update</Button><Button size="sm" variant="destructive" onClick={() => void deleteRole()} disabled={!canManage || saving || !selectedRoleId}>Delete</Button></div></CardContent></Card></div>
          ) : null}

          {section === "security" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Security Policy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ip-allowlist">IP Allowlist</Label>
                    <Textarea
                      id="ip-allowlist"
                      rows={5}
                      placeholder="One IP/CIDR per line"
                      value={securityForm.ipAllowlistText}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, ipAllowlistText: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ip-blocklist">IP Blocklist</Label>
                    <Textarea
                      id="ip-blocklist"
                      rows={5}
                      placeholder="One IP/CIDR per line"
                      value={securityForm.ipBlocklistText}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, ipBlocklistText: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="country-allowlist">Country Allowlist (ISO)</Label>
                    <Textarea
                      id="country-allowlist"
                      rows={4}
                      placeholder="US, AE, IN..."
                      value={securityForm.countryAllowlistText}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, countryAllowlistText: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="country-blocklist">Country Blocklist (ISO)</Label>
                    <Textarea
                      id="country-blocklist"
                      rows={4}
                      placeholder="US, AE, IN..."
                      value={securityForm.countryBlocklistText}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, countryBlocklistText: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="rate-max">Login Max Attempts</Label>
                    <Input
                      id="rate-max"
                      type="number"
                      min={1}
                      max={50}
                      value={securityForm.rateMaxAttempts}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, rateMaxAttempts: Number(event.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rate-window">Rate Window (minutes)</Label>
                    <Input
                      id="rate-window"
                      type="number"
                      min={1}
                      max={120}
                      value={securityForm.rateWindowMinutes}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, rateWindowMinutes: Number(event.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rate-lock">Lock Duration (minutes)</Label>
                    <Input
                      id="rate-lock"
                      type="number"
                      min={1}
                      max={240}
                      value={securityForm.rateLockMinutes}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, rateLockMinutes: Number(event.target.value) }))}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pwd-min">Min Password Length</Label>
                    <Input
                      id="pwd-min"
                      type="number"
                      min={8}
                      max={128}
                      value={securityForm.minPasswordLength}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, minPasswordLength: Number(event.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="session-max">Session Max (minutes)</Label>
                    <Input
                      id="session-max"
                      type="number"
                      min={15}
                      max={43200}
                      value={securityForm.sessionMaxMinutes}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, sessionMaxMinutes: Number(event.target.value) }))}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 rounded-md border p-3">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={securityForm.requireUpper}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, requireUpper: event.target.checked }))}
                    />
                    Require uppercase
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={securityForm.requireLower}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, requireLower: event.target.checked }))}
                    />
                    Require lowercase
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={securityForm.requireNumber}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, requireNumber: event.target.checked }))}
                    />
                    Require number
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={securityForm.requireSymbol}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, requireSymbol: event.target.checked }))}
                    />
                    Require symbol
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={securityForm.enforce2FAForAdmins}
                      onChange={(event) => setSecurityForm((prev) => ({ ...prev, enforce2FAForAdmins: event.target.checked }))}
                    />
                    Enforce 2FA for admins
                  </label>
                </div>

                <Button size="sm" onClick={() => void saveSecurityPolicy()} disabled={!canManage || securitySaving}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {securitySaving ? "Saving..." : "Save Security Policy"}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {section === "deployment" ? (
            <div className="space-y-4">
              {/* Status bar */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Server className="h-4 w-4 text-[#AA8038]" />
                    Deployment Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Current URL</p>
                      <p className="mt-0.5 break-all text-sm font-semibold text-slate-800">{typeof window !== "undefined" ? window.location.origin : "—"}</p>
                    </div>
                    <div className="rounded-lg border bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Protocol</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {typeof window !== "undefined" && window.location.protocol === "https:" ? (
                          <><Lock className="h-4 w-4 text-emerald-600" /><span className="font-semibold text-emerald-700">HTTPS (Secure)</span></>
                        ) : (
                          <><Globe className="h-4 w-4 text-amber-600" /><span className="font-semibold text-amber-700">HTTP (Not secure)</span></>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Environment</p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-800">{process.env.NODE_ENV ?? "unknown"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* SSL Setup Options */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Option A: Reverse Proxy (Recommended) */}
                <Card className="border-emerald-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm text-emerald-800">
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Recommended</span>
                      Option A — Reverse Proxy SSL
                    </CardTitle>
                    <p className="text-xs text-slate-500">IIS or Nginx handles SSL. App runs on HTTP internally. Best for Windows Server.</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-xs text-slate-700">
                      <div className="rounded-md bg-slate-900 p-3 font-mono text-emerald-400">
                        <p className="text-slate-400"># Internet → IIS/Nginx (port 443, SSL) → App (port 3000, HTTP)</p>
                        <p className="mt-1">PORT=3000</p>
                        <p>NODE_ENV=production</p>
                        <p>FORCE_HTTPS=true  <span className="text-slate-500"># optional: redirects HTTP→HTTPS</span></p>
                      </div>
                      <p className="font-medium text-slate-800">Steps:</p>
                      <ol className="list-decimal space-y-1 pl-4">
                        <li>Run the app on port 3000 (HTTP) using PM2</li>
                        <li>Install your SSL cert in IIS or Nginx</li>
                        <li>Configure IIS ARR or Nginx to proxy port 443 → localhost:3000</li>
                        <li>Set <code className="rounded bg-slate-100 px-1">FORCE_HTTPS=true</code> in your .env to redirect HTTP visitors</li>
                      </ol>
                    </div>
                  </CardContent>
                </Card>

                {/* Option B: Direct HTTPS */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Lock className="h-4 w-4 text-blue-600" />
                      Option B — Direct HTTPS (cert files)
                    </CardTitle>
                    <p className="text-xs text-slate-500">App handles SSL directly. Requires cert + key files on the server.</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-xs text-slate-700">
                      <div className="rounded-md bg-slate-900 p-3 font-mono text-blue-300">
                        <p className="text-slate-400"># In your .env file (server-side only)</p>
                        <p>PORT=443</p>
                        <p>NODE_ENV=production</p>
                        <p>SSL_CERT_PATH=C:\ssl\cert.crt</p>
                        <p>SSL_KEY_PATH=C:\ssl\private.key</p>
                        <p>FORCE_HTTPS=true</p>
                        <p>HTTP_PORT=80  <span className="text-slate-500"># redirect listener</span></p>
                      </div>
                      <p className="font-medium text-slate-800">Then start with:</p>
                      <div className="rounded-md bg-slate-900 p-3 font-mono text-green-400">
                        <p>npm run build</p>
                        <p>npm run start:prod</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Windows Firewall */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Shield className="h-4 w-4 text-orange-600" />
                    Windows Firewall Rules
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-xs text-slate-500">Run these commands as Administrator in PowerShell to open the required ports.</p>
                  <div className="rounded-md bg-slate-900 p-3 font-mono text-xs text-green-400 space-y-1">
                    <p className="text-slate-400"># Open HTTP (port 80)</p>
                    <p>{"netsh advfirewall firewall add rule name=\"DevotionDash HTTP\" protocol=TCP dir=in localport=80 action=allow"}</p>
                    <p className="mt-2 text-slate-400"># Open HTTPS (port 443)</p>
                    <p>{"netsh advfirewall firewall add rule name=\"DevotionDash HTTPS\" protocol=TCP dir=in localport=443 action=allow"}</p>
                    <p className="mt-2 text-slate-400"># Open app port (if using reverse proxy)</p>
                    <p>{"netsh advfirewall firewall add rule name=\"DevotionDash App\" protocol=TCP dir=in localport=3000 action=allow"}</p>
                    <p className="mt-2 text-slate-400"># Open MySQL (only if external access needed — otherwise keep closed)</p>
                    <p>{"netsh advfirewall firewall add rule name=\"MySQL\" protocol=TCP dir=in localport=3306 action=allow"}</p>
                  </div>
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <strong>Security tip:</strong> Keep MySQL port 3306 closed to the internet. Only open it if your DB is on a different machine. Use the IP Allowlist in the Security section to restrict access to your app.
                  </div>
                </CardContent>
              </Card>

              {/* PM2 Process Manager */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <RefreshCw className="h-4 w-4 text-violet-600" />
                    PM2 — Keep App Running (Auto-restart)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-xs text-slate-500">PM2 keeps the app running after crashes and restarts on boot.</p>
                  <div className="rounded-md bg-slate-900 p-3 font-mono text-xs text-green-400 space-y-1">
                    <p className="text-slate-400"># Install PM2 globally (once)</p>
                    <p>npm install -g pm2</p>
                    <p className="mt-2 text-slate-400"># Build the app</p>
                    <p>npm run build</p>
                    <p className="mt-2 text-slate-400"># Start with PM2 (using built-in Next.js HTTP server)</p>
                    <p>pm2 start npm --name devotiondash -- run start</p>
                    <p className="mt-2 text-slate-400"># OR start with custom HTTPS server</p>
                    <p>pm2 start npm --name devotiondash -- run start:prod</p>
                    <p className="mt-2 text-slate-400"># Save and enable auto-start on Windows boot</p>
                    <p>pm2 save</p>
                    <p>pm2-startup install  <span className="text-slate-500"># then follow the instructions it prints</span></p>
                    <p className="mt-2 text-slate-400"># Useful PM2 commands</p>
                    <p>pm2 status          <span className="text-slate-500"># view all processes</span></p>
                    <p>pm2 logs devotiondash    <span className="text-slate-500"># live log tail</span></p>
                    <p>pm2 restart devotiondash <span className="text-slate-500"># restart after config change</span></p>
                  </div>
                </CardContent>
              </Card>

              {/* Environment variables reference */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">.env Reference — All Required Variables</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md bg-slate-900 p-4 font-mono text-xs space-y-1">
                    <p className="text-slate-400"># ── Database ───────────────────────────────────────</p>
                    <p className="text-blue-300">DATABASE_URL<span className="text-white">="mysql://user:password@localhost:3306/devotiondash"</span></p>
                    <p className="mt-2 text-slate-400"># ── Auth ───────────────────────────────────────────</p>
                    <p className="text-blue-300">AUTH_SECRET<span className="text-white">="your-32-char-random-secret"</span></p>
                    <p className="text-blue-300">NEXTAUTH_URL<span className="text-white">="https://yourserver.com"</span></p>
                    <p className="mt-2 text-slate-400"># ── Server ─────────────────────────────────────────</p>
                    <p className="text-blue-300">NODE_ENV<span className="text-white">="production"</span></p>
                    <p className="text-blue-300">PORT<span className="text-white">="3000"</span></p>
                    <p className="mt-2 text-slate-400"># ── SSL (Option B only) ────────────────────────────</p>
                    <p className="text-yellow-300">SSL_CERT_PATH<span className="text-white">="C:\ssl\cert.crt"</span></p>
                    <p className="text-yellow-300">SSL_KEY_PATH<span className="text-white">="C:\ssl\private.key"</span></p>
                    <p className="text-yellow-300">FORCE_HTTPS<span className="text-white">="true"</span></p>
                    <p className="text-yellow-300">HTTP_PORT<span className="text-white">="80"</span></p>
                    <p className="mt-2 text-slate-400"># ── AI (optional) ──────────────────────────────────</p>
                    <p className="text-green-300">ANTHROPIC_API_KEY<span className="text-white">="sk-ant-..."</span></p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {section === "telephony" ? (
            <div className="space-y-4">
              {/* ── Tab Bar ── */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Telephony Administration</h2>
                  <p className="text-xs text-slate-500">Manage SIP providers, extensions, blacklist, and integration guides.</p>
                </div>
              </div>
              <div className="flex gap-1 border-b pb-0">
                {(["providers", "extensions", "blacklist", "guide"] as const).map((tab) => (
                  <button key={tab} onClick={() => setTelTab(tab)} className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors", telTab === tab ? "border-[#AA8038] text-[#AA8038]" : "border-transparent text-slate-500 hover:text-slate-800")}>
                    {tab === "providers" ? "Providers" : tab === "extensions" ? "Extensions" : tab === "blacklist" ? "Blacklist" : "3CX Setup Guide"}
                  </button>
                ))}
              </div>

              {telLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
              ) : (
                <>
                  {/* ── PROVIDERS TAB ── */}
                  {telTab === "providers" ? (
                    <div className={cn("grid gap-4", providerFormOpen ? "lg:grid-cols-2" : "")}>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-500">{providers.length} provider{providers.length !== 1 ? "s" : ""} configured</p>
                          {canManage && (
                            <Button size="sm" className="bg-[#AA8038] text-white hover:bg-[#D98D00]" onClick={() => {
                              setSelectedProvider(null);
                              setProviderForm({ name: "", providerType: "generic", host: "", port: 5060, username: "", password: "", transport: "UDP", fromDomain: "", callerIdName: "", callerIdNum: "", isActive: true, isDefault: false, notes: "" });
                              setShowProviderPassword(false);
                              setProviderFormOpen(true);
                            }}>
                              <Plus className="mr-1.5 h-3.5 w-3.5" />Add Provider
                            </Button>
                          )}
                        </div>
                        {providers.length === 0 ? (
                          <Card><CardContent className="py-10 text-center text-sm text-slate-500">No SIP providers configured yet. Add one to connect your telephony system.</CardContent></Card>
                        ) : (
                          <div className="space-y-2">
                            {providers.map((p) => {
                              const typeColors: Record<string, string> = { "3cx": "bg-blue-100 text-blue-700", asterisk: "bg-orange-100 text-orange-700", freepbx: "bg-purple-100 text-purple-700", twilio: "bg-red-100 text-red-700", vonage: "bg-indigo-100 text-indigo-700", ringcentral: "bg-emerald-100 text-emerald-700", generic: "bg-slate-100 text-slate-600" };
                              return (
                                <Card key={p.id} className={cn("cursor-pointer transition-colors hover:bg-slate-50", selectedProvider?.id === p.id && "border-[#AA8038]/30 bg-[#AA8038]/5")} onClick={() => {
                                  setSelectedProvider(p);
                                  setProviderForm({ name: p.name, providerType: p.providerType, host: p.host, port: p.port, username: p.username, password: p.password, transport: p.transport, fromDomain: p.fromDomain ?? "", callerIdName: p.callerIdName ?? "", callerIdNum: p.callerIdNum ?? "", isActive: p.isActive, isDefault: p.isDefault, notes: p.notes ?? "" });
                                  setShowProviderPassword(false);
                                  setProviderFormOpen(true);
                                }}>
                                  <CardContent className="p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                                        <span className="font-medium text-sm truncate">{p.name}</span>
                                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", typeColors[p.providerType] ?? typeColors.generic)}>{p.providerType}</span>
                                        {p.isDefault && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Default</span>}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500">{p.host}:{p.port}</span>
                                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600">{p.transport}</span>
                                        <Badge variant={p.isActive ? "default" : "secondary"} className="text-xs">{p.isActive ? "Active" : "Inactive"}</Badge>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Provider Form Panel */}
                      {providerFormOpen && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm">{selectedProvider ? "Edit Provider" : "New SIP Provider"}</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5 sm:col-span-2">
                                <Label className="text-xs">Provider Name *</Label>
                                <Input value={providerForm.name} onChange={(e) => setProviderForm((p) => ({ ...p, name: e.target.value }))} placeholder="Main SIP Trunk" />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Provider Type</Label>
                                <Select value={providerForm.providerType} onValueChange={(v) => v && setProviderForm((p) => ({ ...p, providerType: v }))}>
                                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="3cx">3CX</SelectItem>
                                    <SelectItem value="asterisk">Asterisk</SelectItem>
                                    <SelectItem value="freepbx">FreePBX</SelectItem>
                                    <SelectItem value="twilio">Twilio</SelectItem>
                                    <SelectItem value="vonage">Vonage</SelectItem>
                                    <SelectItem value="ringcentral">RingCentral</SelectItem>
                                    <SelectItem value="generic">Generic SIP</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Transport</Label>
                                <Select value={providerForm.transport} onValueChange={(v) => v && setProviderForm((p) => ({ ...p, transport: v }))}>
                                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="UDP">UDP</SelectItem>
                                    <SelectItem value="TCP">TCP</SelectItem>
                                    <SelectItem value="TLS">TLS</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Host / Domain *</Label>
                                <Input value={providerForm.host} onChange={(e) => setProviderForm((p) => ({ ...p, host: e.target.value }))} placeholder="sip.provider.com" />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Port</Label>
                                <Input type="number" value={providerForm.port} onChange={(e) => setProviderForm((p) => ({ ...p, port: Number(e.target.value) || 5060 }))} placeholder="5060" />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Username *</Label>
                                <Input value={providerForm.username} onChange={(e) => setProviderForm((p) => ({ ...p, username: e.target.value }))} placeholder="trunk_user" />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Password *</Label>
                                <div className="relative">
                                  <Input type={showProviderPassword ? "text" : "password"} value={providerForm.password} onChange={(e) => setProviderForm((p) => ({ ...p, password: e.target.value }))} placeholder="••••••••" className="pr-9" />
                                  <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setShowProviderPassword((v) => !v)}>
                                    {showProviderPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">From Domain (optional)</Label>
                                <Input value={providerForm.fromDomain} onChange={(e) => setProviderForm((p) => ({ ...p, fromDomain: e.target.value }))} placeholder="company.com" />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Caller ID Name (optional)</Label>
                                <Input value={providerForm.callerIdName} onChange={(e) => setProviderForm((p) => ({ ...p, callerIdName: e.target.value }))} placeholder="Support" />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Caller ID Number (optional)</Label>
                                <Input value={providerForm.callerIdNum} onChange={(e) => setProviderForm((p) => ({ ...p, callerIdNum: e.target.value }))} placeholder="+19995551234" />
                              </div>
                              <div className="space-y-1.5 sm:col-span-2">
                                <Label className="text-xs">Notes (optional)</Label>
                                <Textarea value={providerForm.notes} onChange={(e) => setProviderForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Any notes about this provider..." rows={2} />
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={providerForm.isActive} onChange={(e) => setProviderForm((p) => ({ ...p, isActive: e.target.checked }))} className="rounded" />
                                Active
                              </label>
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={providerForm.isDefault} onChange={(e) => setProviderForm((p) => ({ ...p, isDefault: e.target.checked }))} className="rounded" />
                                Set as Default
                              </label>
                            </div>
                            {providerForm.providerType === "3cx" && (
                              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 space-y-1">
                                <p className="font-semibold">3CX Configuration</p>
                                <p>Set Host to your 3CX server IP/domain. Use the SIP trunk username and password from 3CX Management Console → SIP Trunks. Default port is 5060 (or 5061 for TLS). Set Transport to TLS for encrypted connections.</p>
                              </div>
                            )}
                            <div className="flex items-center gap-2 pt-1">
                              {canManage && (
                                <Button size="sm" className="bg-[#AA8038] text-white hover:bg-[#D98D00]" disabled={providerSaving || !providerForm.name.trim() || !providerForm.host.trim() || !providerForm.username.trim() || !providerForm.password.trim()} onClick={async () => {
                                  setProviderSaving(true);
                                  try {
                                    const url = selectedProvider ? `/api/telephony/providers/${selectedProvider.id}` : "/api/telephony/providers";
                                    const method = selectedProvider ? "PUT" : "POST";
                                    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...providerForm }) });
                                    if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? "Save failed"); }
                                    toast.success(selectedProvider ? "Provider updated" : "Provider created");
                                    setProviderFormOpen(false);
                                    setSelectedProvider(null);
                                    await loadTelephony();
                                  } catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
                                  finally { setProviderSaving(false); }
                                }}>
                                  <Save className="mr-1.5 h-3.5 w-3.5" />{providerSaving ? "Saving…" : "Save"}
                                </Button>
                              )}
                              {canManage && selectedProvider && (
                                <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" disabled={providerDeleting} onClick={async () => {
                                  if (!confirm("Delete this provider?")) return;
                                  setProviderDeleting(true);
                                  try {
                                    const res = await fetch(`/api/telephony/providers/${selectedProvider.id}`, { method: "DELETE" });
                                    if (!res.ok) throw new Error("Delete failed");
                                    toast.success("Provider deleted");
                                    setProviderFormOpen(false);
                                    setSelectedProvider(null);
                                    await loadTelephony();
                                  } catch (err) { toast.error(err instanceof Error ? err.message : "Delete failed"); }
                                  finally { setProviderDeleting(false); }
                                }}>
                                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />{providerDeleting ? "Deleting…" : "Delete"}
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => { setProviderFormOpen(false); setSelectedProvider(null); }}>Cancel</Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  ) : null}

                  {/* ── EXTENSIONS TAB ── */}
                  {telTab === "extensions" ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">{extensions.length} extension{extensions.length !== 1 ? "s" : ""} configured</p>
                        {canManage && (
                          <Button size="sm" className="bg-[#AA8038] text-white hover:bg-[#D98D00]" onClick={() => { setExtForm({ number: "", userId: "", password: "", isActive: true }); setExtFormOpen(true); }}>
                            <Plus className="mr-1.5 h-3.5 w-3.5" />Add Extension
                          </Button>
                        )}
                      </div>
                      {extensions.length === 0 ? (
                        <Card><CardContent className="py-10 text-center text-sm text-slate-500">No extensions configured. Add extensions to assign phone lines to team members.</CardContent></Card>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Extension</TableHead>
                              <TableHead>Assigned User</TableHead>
                              <TableHead>Status</TableHead>
                              {canManage && <TableHead className="w-16"></TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {extensions.map((ext) => {
                              const assignedUser = users.find((u) => u.id === ext.userId);
                              return (
                                <TableRow key={ext.id}>
                                  <TableCell className="font-mono text-sm font-medium">{ext.number}</TableCell>
                                  <TableCell className="text-sm">{assignedUser ? assignedUser.fullname || assignedUser.name : <span className="text-slate-400 italic">Unassigned</span>}</TableCell>
                                  <TableCell><Badge variant={ext.isActive ? "default" : "secondary"} className="text-xs">{ext.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                                  {canManage && (
                                    <TableCell>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={async () => {
                                        if (!confirm(`Delete extension ${ext.number}?`)) return;
                                        try {
                                          const res = await fetch(`/api/telephony/extensions/${ext.id}`, { method: "DELETE" });
                                          if (!res.ok) throw new Error("Delete failed");
                                          toast.success("Extension deleted");
                                          await loadTelephony();
                                        } catch (err) { toast.error(err instanceof Error ? err.message : "Delete failed"); }
                                      }}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TableCell>
                                  )}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}

                      {/* Add Extension Dialog */}
                      <Dialog open={extFormOpen} onOpenChange={setExtFormOpen}>
                        <DialogContent className="max-w-sm">
                          <DialogHeader><DialogTitle>Add Extension</DialogTitle></DialogHeader>
                          <div className="space-y-3 py-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Extension Number *</Label>
                              <Input value={extForm.number} onChange={(e) => setExtForm((p) => ({ ...p, number: e.target.value }))} placeholder="101" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Assign to User (optional)</Label>
                              <Select value={extForm.userId || "__none__"} onValueChange={(v) => v && setExtForm((p) => ({ ...p, userId: v === "__none__" ? "" : v }))}>
                                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select user..." /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">Unassigned</SelectItem>
                                  {users.filter((u) => u.isActive).map((u) => (
                                    <SelectItem key={u.id} value={u.id}>{u.fullname || u.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">SIP Password *</Label>
                              <Input type="password" value={extForm.password} onChange={(e) => setExtForm((p) => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
                            </div>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input type="checkbox" checked={extForm.isActive} onChange={(e) => setExtForm((p) => ({ ...p, isActive: e.target.checked }))} className="rounded" />
                              Active
                            </label>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" size="sm" onClick={() => setExtFormOpen(false)}>Cancel</Button>
                            <Button size="sm" className="bg-[#AA8038] text-white hover:bg-[#D98D00]" disabled={extSaving || !extForm.number.trim() || !extForm.password.trim()} onClick={async () => {
                              setExtSaving(true);
                              try {
                                const res = await fetch("/api/telephony/extensions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number: extForm.number.trim(), userId: extForm.userId || undefined, password: extForm.password.trim(), isActive: extForm.isActive }) });
                                if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? "Save failed"); }
                                toast.success("Extension created");
                                setExtFormOpen(false);
                                await loadTelephony();
                              } catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
                              finally { setExtSaving(false); }
                            }}>
                              {extSaving ? "Saving…" : "Save"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  ) : null}

                  {/* ── BLACKLIST TAB ── */}
                  {telTab === "blacklist" ? (
                    <div className="space-y-3">
                      {canManage && (
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-end gap-2">
                              <div className="space-y-1.5 flex-1">
                                <Label className="text-xs">Phone Number to Block *</Label>
                                <Input value={blNumber} onChange={(e) => setBlNumber(e.target.value)} placeholder="+19995551234" />
                              </div>
                              <div className="space-y-1.5 flex-1">
                                <Label className="text-xs">Reason (optional)</Label>
                                <Input value={blReason} onChange={(e) => setBlReason(e.target.value)} placeholder="Spam caller" />
                              </div>
                              <Button size="sm" className="bg-[#AA8038] text-white hover:bg-[#D98D00]" disabled={blSaving || !blNumber.trim()} onClick={async () => {
                                setBlSaving(true);
                                try {
                                  const res = await fetch("/api/telephony/blacklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number: blNumber.trim(), reason: blReason.trim() || undefined }) });
                                  if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? "Save failed"); }
                                  toast.success("Number blocked");
                                  setBlNumber(""); setBlReason("");
                                  await loadTelephony();
                                } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
                                finally { setBlSaving(false); }
                              }}>
                                <Plus className="mr-1.5 h-3.5 w-3.5" />Block
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      {blacklist.length === 0 ? (
                        <Card><CardContent className="py-10 text-center text-sm text-slate-500">No numbers on the blacklist. Use the form above to block unwanted callers.</CardContent></Card>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Number</TableHead>
                              <TableHead>Reason</TableHead>
                              <TableHead>Date Added</TableHead>
                              {canManage && <TableHead className="w-16"></TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {blacklist.map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell className="font-mono text-sm">{entry.number}</TableCell>
                                <TableCell className="text-sm text-slate-600">{entry.reason ?? <span className="italic text-slate-400">No reason</span>}</TableCell>
                                <TableCell className="text-xs text-slate-500">{formatDateTime(entry.createdAt, timezone)}</TableCell>
                                {canManage && (
                                  <TableCell>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={async () => {
                                      if (!confirm(`Unblock ${entry.number}?`)) return;
                                      try {
                                        const res = await fetch(`/api/telephony/blacklist/${entry.id}`, { method: "DELETE" });
                                        if (!res.ok) throw new Error("Failed");
                                        toast.success("Number unblocked");
                                        await loadTelephony();
                                      } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
                                    }}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  ) : null}

                  {/* ── 3CX SETUP GUIDE TAB ── */}
                  {telTab === "guide" ? (
                    <div className="space-y-4 max-w-2xl">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-blue-600" />
                            How to Connect 3CX to DevotionDash
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-slate-700 space-y-3">
                          <p className="text-xs text-slate-500">Follow these steps to integrate your 3CX phone system with DevotionDash telephony.</p>
                          <ol className="space-y-2 list-none">
                            {[
                              "In 3CX Management Console, go to SIP Trunks → Add new trunk.",
                              "Set the trunk destination to point to this server's IP address.",
                              "Copy the SIP trunk username and password shown by 3CX.",
                              "In the Providers tab above, click Add Provider and choose type 3CX.",
                              "Enter your 3CX server IP as Host and port 5060 (or 5061 for TLS connections).",
                              "Paste the trunk credentials into the Username and Password fields.",
                              "For each support agent, create an Extension matching their 3CX extension number.",
                              "Assign extensions to team members so incoming calls are matched to the correct user.",
                              "In 3CX, configure Inbound Rules to route calls to the SIP trunk pointing at this server.",
                              "Test with a call — it should appear in the Telephony → Journal tab after the call ends.",
                            ].map((step, i) => (
                              <li key={i} className="flex gap-3">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">{i + 1}</span>
                                <span className="pt-0.5">{step}</span>
                              </li>
                            ))}
                          </ol>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Tips</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-slate-600 space-y-2">
                          <p>• Use TLS transport for encrypted SIP signaling (port 5061).</p>
                          <p>• If calls are not routing, verify the SIP trunk is registered in 3CX Management Console → SIP Trunks → Status.</p>
                          <p>• Each extension number must match exactly with the 3CX extension number for call matching to work.</p>
                          <p>• For outbound calls, ensure an Outbound Rule in 3CX routes through the configured trunk.</p>
                          <p>• Use the Caller ID Name and Number fields on the Provider to override outbound caller identity.</p>
                        </CardContent>
                      </Card>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {section === "tenants" ? (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Tenant Management</h2>
        <p className="text-xs text-slate-500">Manage subscriber tenants, plans, and billing.</p>
      </div>
      <Button size="sm" className="bg-[#AA8038] text-white hover:bg-[#D98D00]" onClick={() => { setTenantForm(EMPTY_TENANT_FORM); setCreateTenantOpen(true); }}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />New Tenant
      </Button>
    </div>

    {tenantsLoading ? (
      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
    ) : tenants.length === 0 ? (
      <Card><CardContent className="p-8 text-center text-sm text-slate-500">No tenants yet. Create the first one to get started.</CardContent></Card>
    ) : (
      <div className="grid gap-3">
        {tenants.map((tenant) => {
          const statusColor = tenant.status === "active" ? "text-emerald-700 bg-emerald-100 border-emerald-200" : tenant.status === "trial" ? "text-blue-700 bg-blue-100 border-blue-200" : tenant.status === "suspended" ? "text-amber-700 bg-amber-100 border-amber-200" : "text-slate-600 bg-slate-100 border-slate-200";
          return (
            <Card key={tenant.id} className={cn("cursor-pointer transition-colors hover:bg-slate-50", selectedTenant?.id === tenant.id && "border-[#AA8038]/30 bg-[#AA8038]/5")} onClick={() => setSelectedTenant(selectedTenant?.id === tenant.id ? null : tenant)}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{tenant.name}</p>
                      <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5", statusColor)}>{tenant.status}</Badge>
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-slate-200 text-slate-600">{tenant.plan}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{tenant.defaultDomain}{tenant.customDomain ? ` · ${tenant.customDomain}` : ""}</p>
                    <p className="text-xs text-slate-400">{tenant.adminEmail} · max {tenant.maxUsers} users</p>
                  </div>
                  <div className="text-right text-xs text-slate-500 shrink-0">
                    {tenant.subscription ? (
                      <>
                        <p className="font-medium text-slate-700">
                          {tenant.subscription.billingType === "per_user_monthly"
                            ? `$${tenant.subscription.pricePerUser ?? "—"}/user/mo`
                            : `$${tenant.subscription.flatPrice ?? "—"}/mo`}
                        </p>
                        {tenant.subscription.nextBillingAt && (
                          <p>Next bill: {new Date(tenant.subscription.nextBillingAt).toLocaleDateString()}</p>
                        )}
                      </>
                    ) : <p className="text-slate-400">No subscription</p>}
                    <p className="mt-0.5 text-slate-400">Created {new Date(tenant.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                {selectedTenant?.id === tenant.id && (
                  <div className="mt-4 space-y-3 border-t pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Tenant Name</Label>
                        <Input value={selectedTenant.name} onChange={(e) => setSelectedTenant((t) => t ? { ...t, name: e.target.value } : t)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Custom Domain</Label>
                        <Input value={selectedTenant.customDomain ?? ""} onChange={(e) => setSelectedTenant((t) => t ? { ...t, customDomain: e.target.value || null } : t)} placeholder="crm.client.com" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Plan</Label>
                        <Select value={selectedTenant.plan} onValueChange={(v) => v && setSelectedTenant((t) => t ? { ...t, plan: v } : t)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["basic", "pro", "enterprise"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Status</Label>
                        <Select value={selectedTenant.status} onValueChange={(v) => v && setSelectedTenant((t) => t ? { ...t, status: v } : t)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["trial", "active", "suspended", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Max Users</Label>
                        <Input type="number" value={selectedTenant.maxUsers} onChange={(e) => setSelectedTenant((t) => t ? { ...t, maxUsers: Number(e.target.value) } : t)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Admin Email</Label>
                        <Input value={selectedTenant.adminEmail} onChange={(e) => setSelectedTenant((t) => t ? { ...t, adminEmail: e.target.value } : t)} />
                      </div>
                    </div>

                    {selectedTenant.subscription && (
                      <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                        <p className="text-xs font-semibold text-slate-700">Subscription</p>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Billing Type</Label>
                            <Select value={selectedTenant.subscription.billingType} onValueChange={(v) => v && setSelectedTenant((t) => t && t.subscription ? { ...t, subscription: { ...t.subscription, billingType: v } } : t)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="per_user_monthly">Per User/Month</SelectItem>
                                <SelectItem value="flat_monthly">Flat Monthly</SelectItem>
                                <SelectItem value="annual">Annual</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Price/User ($)</Label>
                            <Input value={selectedTenant.subscription.pricePerUser ?? ""} onChange={(e) => setSelectedTenant((t) => t && t.subscription ? { ...t, subscription: { ...t.subscription, pricePerUser: e.target.value || null } } : t)} placeholder="e.g. 5.00" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Flat Price ($)</Label>
                            <Input value={selectedTenant.subscription.flatPrice ?? ""} onChange={(e) => setSelectedTenant((t) => t && t.subscription ? { ...t, subscription: { ...t.subscription, flatPrice: e.target.value || null } } : t)} placeholder="e.g. 49.00" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Currency</Label>
                            <Input value={selectedTenant.subscription.currency} onChange={(e) => setSelectedTenant((t) => t && t.subscription ? { ...t, subscription: { ...t.subscription, currency: e.target.value } } : t)} placeholder="USD" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Next Billing Date</Label>
                            <Input type="date" value={selectedTenant.subscription.nextBillingAt ? new Date(selectedTenant.subscription.nextBillingAt).toISOString().slice(0,10) : ""} onChange={(e) => setSelectedTenant((t) => t && t.subscription ? { ...t, subscription: { ...t.subscription, nextBillingAt: e.target.value || null } } : t)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Billing Status</Label>
                            <Select value={selectedTenant.subscription.status} onValueChange={(v) => v && setSelectedTenant((t) => t && t.subscription ? { ...t, subscription: { ...t.subscription, status: v } } : t)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["active", "past_due", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">Notes</Label>
                      <Textarea value={selectedTenant.notes ?? ""} onChange={(e) => setSelectedTenant((t) => t ? { ...t, notes: e.target.value || null } : t)} rows={2} placeholder="Internal billing notes..." />
                    </div>

                    <div className="flex items-center gap-2">
                      <Button size="sm" className="bg-[#AA8038] text-white hover:bg-[#D98D00]" disabled={tenantSaving} onClick={async () => {
                        if (!selectedTenant) return;
                        setTenantSaving(true);
                        try {
                          const r = await fetch(`/api/platform/tenants/${selectedTenant.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ...selectedTenant, billing: selectedTenant.subscription }),
                          });
                          if (r.ok) { await loadTenants(); toast.success("Tenant updated"); }
                          else toast.error("Failed to update tenant");
                        } finally { setTenantSaving(false); }
                      }}>
                        {tenantSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}Save Changes
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedTenant(null)}>Cancel</Button>
                      <Button size="sm" variant="outline" className="ml-auto text-rose-600 hover:bg-rose-50" disabled={tenantSaving} onClick={async () => {
                        if (!selectedTenant || !confirm(`Delete tenant "${selectedTenant.name}"? This cannot be undone.`)) return;
                        const r = await fetch(`/api/platform/tenants/${selectedTenant.id}`, { method: "DELETE" });
                        if (r.ok) { await loadTenants(); setSelectedTenant(null); toast.success("Tenant deleted"); }
                        else toast.error("Failed to delete tenant");
                      }}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />Delete
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    )}

    {/* Create Tenant Dialog */}
    <Dialog open={createTenantOpen} onOpenChange={setCreateTenantOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Tenant</DialogTitle>
          <DialogDescription>Register a new subscriber tenant. You must have already created their MySQL database.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 py-2">
          <div className="space-y-1.5">
            <Label>Tenant Name <span className="text-red-500">*</span></Label>
            <Input value={tenantForm.name} onChange={(e) => setTenantForm((f) => ({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-") }))} placeholder="Acme Corp" />
          </div>
          <div className="space-y-1.5">
            <Label>Slug <span className="text-red-500">*</span></Label>
            <Input value={tenantForm.slug} onChange={(e) => setTenantForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))} placeholder="acme-corp" />
          </div>
          <div className="space-y-1.5">
            <Label>Default Domain <span className="text-red-500">*</span></Label>
            <Input value={tenantForm.defaultDomain} onChange={(e) => setTenantForm((f) => ({ ...f, defaultDomain: e.target.value }))} placeholder="acme.yourplatform.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Custom Domain</Label>
            <Input value={tenantForm.customDomain} onChange={(e) => setTenantForm((f) => ({ ...f, customDomain: e.target.value }))} placeholder="crm.acme.com (optional)" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Database URL <span className="text-red-500">*</span></Label>
            <Input value={tenantForm.databaseUrl} onChange={(e) => setTenantForm((f) => ({ ...f, databaseUrl: e.target.value }))} placeholder="mysql://user:pass@localhost:3306/devotiondash_acme" type="password" />
            <p className="text-[11px] text-slate-500">Run: <code>npx tsx scripts/setup-tenant.ts --db-url=&quot;...&quot; --admin-email=... --admin-password=...</code> first</p>
          </div>
          <div className="space-y-1.5">
            <Label>Admin Email <span className="text-red-500">*</span></Label>
            <Input type="email" value={tenantForm.adminEmail} onChange={(e) => setTenantForm((f) => ({ ...f, adminEmail: e.target.value }))} placeholder="admin@acme.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Brand Name</Label>
            <Input value={tenantForm.brandName} onChange={(e) => setTenantForm((f) => ({ ...f, brandName: e.target.value }))} placeholder="Acme CRM" />
          </div>
          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select value={tenantForm.plan} onValueChange={(v) => v && setTenantForm((f) => ({ ...f, plan: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["basic", "pro", "enterprise"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Max Users</Label>
            <Input type="number" value={tenantForm.maxUsers} onChange={(e) => setTenantForm((f) => ({ ...f, maxUsers: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Trial Days</Label>
            <Input type="number" value={tenantForm.trialDays} onChange={(e) => setTenantForm((f) => ({ ...f, trialDays: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Billing Type</Label>
            <Select value={tenantForm.billingType} onValueChange={(v) => v && setTenantForm((f) => ({ ...f, billingType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="per_user_monthly">Per User / Month</SelectItem>
                <SelectItem value="flat_monthly">Flat Monthly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Price/User ($)</Label>
            <Input value={tenantForm.pricePerUser} onChange={(e) => setTenantForm((f) => ({ ...f, pricePerUser: e.target.value }))} placeholder="5.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Flat Price ($)</Label>
            <Input value={tenantForm.flatPrice} onChange={(e) => setTenantForm((f) => ({ ...f, flatPrice: e.target.value }))} placeholder="49.00" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Internal Notes</Label>
            <Textarea value={tenantForm.notes} onChange={(e) => setTenantForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Contract details, contact info..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateTenantOpen(false)}>Cancel</Button>
          <Button className="bg-[#AA8038] text-white hover:bg-[#D98D00]" disabled={tenantSaving || !tenantForm.name || !tenantForm.slug || !tenantForm.defaultDomain || !tenantForm.databaseUrl || !tenantForm.adminEmail} onClick={async () => {
            setTenantSaving(true);
            try {
              const r = await fetch("/api/platform/tenants", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...tenantForm,
                  pricePerUser: tenantForm.pricePerUser ? Number(tenantForm.pricePerUser) : null,
                  flatPrice: tenantForm.flatPrice ? Number(tenantForm.flatPrice) : null,
                }),
              });
              if (r.ok) {
                await loadTenants();
                setCreateTenantOpen(false);
                setTenantForm(EMPTY_TENANT_FORM);
                toast.success("Tenant created successfully");
              } else {
                const d = await r.json() as { error?: string };
                toast.error(d.error ?? "Failed to create tenant");
              }
            } finally { setTenantSaving(false); }
          }}>
            {tenantSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}Create Tenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
) : null}

          {section === "ticketwidgets" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Ticket Widgets</h2>
                  <p className="text-xs text-slate-500">Embed a support widget on any website. Each widget has its own token and configuration.</p>
                </div>
                <Button size="sm" className="bg-[#AA8038] text-white hover:bg-[#D98D00]" onClick={() => { setWidgetForm(EMPTY_TICKET_WIDGET_FORM); setEditingTicketWidgetId(null); setCreateWidgetOpen(true); }}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />New Widget
                </Button>
              </div>
              {twLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
              ) : ticketWidgets.length === 0 ? (
                <Card><CardContent className="py-10 text-center text-sm text-slate-500">No ticket widgets yet. Create one to get started.</CardContent></Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {ticketWidgets.map((w) => (
                    <Card key={w.id}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-4 w-4 rounded-full flex-shrink-0" style={{ background: w.accentColor }} />
                            <span className="font-medium text-sm truncate">{w.name}</span>
                          </div>
                          <Badge variant={w.enabled ? "default" : "secondary"} className="text-xs flex-shrink-0">
                            {w.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-500 space-y-1">
                          <div><span className="font-medium">Label:</span> {w.brandLabel}</div>
                          <div className="font-mono break-all">{w.token.slice(0, 16)}...</div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => {
                            setShowEmbedFor(w.id);
                            setTwWidgetCopied(false);
                          }}>
                            <Copy className="mr-1 h-3 w-3" />Embed Code
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => {
                            setWidgetForm({ name: w.name, brandLabel: w.brandLabel, welcomeText: w.welcomeText, accentColor: w.accentColor, position: w.position, defaultGroupId: w.defaultGroupId ?? "", allowDomains: w.allowDomains ?? "" });
                            setEditingTicketWidgetId(w.id);
                            setShowEmbedFor(null);
                            setCreateWidgetOpen(true);
                          }}>
                            <Pencil className="mr-1 h-3 w-3" />Edit
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-7" onClick={async () => {
                            const response = await fetch(`/api/ticket-widgets/${w.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !w.enabled }) });
                            if (!response.ok) {
                              const message = await responseErrorMessage(response, "Failed to update widget");
                              toast.error(message);
                              return;
                            }
                            toast.success(`Widget ${w.enabled ? "disabled" : "enabled"}`);
                            void loadTicketWidgets();
                          }}>
                            {w.enabled ? "Disable" : "Enable"}
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-7 text-rose-600 hover:bg-rose-50" onClick={async () => {
                            if (!confirm("Delete this widget?")) return;
                            const response = await fetch(`/api/ticket-widgets/${w.id}`, { method: "DELETE" });
                            if (!response.ok) {
                              const message = await responseErrorMessage(response, "Failed to delete widget");
                              toast.error(message);
                              return;
                            }
                            toast.success("Widget deleted");
                            void loadTicketWidgets();
                          }}>
                            <Trash2 className="mr-1 h-3 w-3" />Delete
                          </Button>
                        </div>
                        {showEmbedFor === w.id && (
                          <div className="rounded-md bg-slate-900 p-3 space-y-2">
                            <p className="text-xs text-slate-300 font-medium">Paste into your website:</p>
                            <pre className="text-[11px] text-green-400 overflow-auto whitespace-pre-wrap break-all">{`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/support-widget.js"\n  data-token="${w.token}"\n  data-base-url="${typeof window !== "undefined" ? window.location.origin : ""}"\n></script>`}</pre>
                            <Button size="sm" className="text-xs h-7 bg-slate-700 hover:bg-slate-600 text-white" onClick={async () => {
                              const origin = window.location.origin;
                              const code = `<script src="${origin}/support-widget.js"\n  data-token="${w.token}"\n  data-base-url="${origin}"\n></script>`;
                              try {
                                if (navigator.clipboard) { await navigator.clipboard.writeText(code); } else { const el = document.createElement("textarea"); el.value = code; el.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el); }
                                setTwWidgetCopied(true); setTimeout(() => setTwWidgetCopied(false), 2000);
                              } catch { /* no-op */ }
                            }}>
                              <Copy className="mr-1 h-3 w-3" />{twWidgetCopied ? "Copied!" : "Copy"}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Create Widget Dialog */}
              <Dialog
                open={createWidgetOpen}
                onOpenChange={(open) => {
                  setCreateWidgetOpen(open);
                  if (!open && !widgetSaving) {
                    setEditingTicketWidgetId(null);
                    setWidgetForm(EMPTY_TICKET_WIDGET_FORM);
                  }
                }}
              >
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingTicketWidgetId ? "Edit Ticket Widget" : "Create Ticket Widget"}</DialogTitle>
                    <DialogDescription>
                      {editingTicketWidgetId
                        ? "Update your embeddable support widget configuration."
                        : "Configure a new embeddable support widget for your website."}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="space-y-1.5">
                      <Label>Widget Name <span className="text-red-500">*</span></Label>
                      <Input value={widgetForm.name} onChange={(e) => setWidgetForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Website Widget" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Button Label</Label>
                      <Input value={widgetForm.brandLabel} onChange={(e) => setWidgetForm((f) => ({ ...f, brandLabel: e.target.value }))} placeholder="Support" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Welcome Text</Label>
                      <Input value={widgetForm.welcomeText} onChange={(e) => setWidgetForm((f) => ({ ...f, welcomeText: e.target.value }))} placeholder="Hi! How can we help you today?" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Accent Color</Label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={widgetForm.accentColor} onChange={(e) => setWidgetForm((f) => ({ ...f, accentColor: e.target.value }))} className="h-9 w-12 cursor-pointer rounded border p-1" />
                          <Input value={widgetForm.accentColor} onChange={(e) => setWidgetForm((f) => ({ ...f, accentColor: e.target.value }))} className="font-mono text-xs" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Position</Label>
                        <Select value={widgetForm.position} onValueChange={(v) => v && setWidgetForm((f) => ({ ...f, position: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="right">Right</SelectItem>
                            <SelectItem value="left">Left</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Allowed Domains <span className="text-slate-400 text-xs">(optional, comma-separated)</span></Label>
                      <Input value={widgetForm.allowDomains} onChange={(e) => setWidgetForm((f) => ({ ...f, allowDomains: e.target.value }))} placeholder="example.com, app.example.com" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateWidgetOpen(false)} disabled={widgetSaving}>Cancel</Button>
                    <Button
                      className="bg-[#AA8038] text-white hover:bg-[#D98D00]"
                      disabled={widgetSaving || !widgetForm.name.trim()}
                      onClick={async () => {
                        setWidgetSaving(true);
                        try {
                          const url = editingTicketWidgetId ? `/api/ticket-widgets/${editingTicketWidgetId}` : "/api/ticket-widgets";
                          const r = await fetch(url, {
                            method: editingTicketWidgetId ? "PUT" : "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(widgetForm),
                          });
                          if (r.ok) {
                            setCreateWidgetOpen(false);
                            setEditingTicketWidgetId(null);
                            setWidgetForm(EMPTY_TICKET_WIDGET_FORM);
                            void loadTicketWidgets();
                            toast.success(editingTicketWidgetId ? "Widget updated" : "Widget created");
                          } else {
                            const d = await r.json() as { error?: string };
                            toast.error(d.error ?? (editingTicketWidgetId ? "Failed to update widget" : "Failed to create widget"));
                          }
                        } finally { setWidgetSaving(false); }
                      }}
                    >
                      {widgetSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                      {editingTicketWidgetId ? "Save Changes" : "Create Widget"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : null}

          {section === "reports" ? (
            <Card><CardHeader><CardTitle className="flex items-center justify-between text-sm"><span>Module Reports & Employee Review</span><div className="flex items-center gap-2"><select className="h-8 rounded-md border px-2 text-xs" value={reportDays} onChange={(e) => setReportDays(Number(e.target.value))}><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option><option value={60}>Last 60 days</option><option value={90}>Last 90 days</option></select><Button size="sm" variant="outline" onClick={() => void loadReports()} disabled={reportsLoading}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{reportsLoading ? "Loading..." : "Refresh"}</Button><Button size="sm" onClick={() => void loadReports(true)} disabled={reportsInsightLoading}><Sparkles className="mr-1.5 h-3.5 w-3.5" />{reportsInsightLoading ? "Analyzing..." : "AI Summary"}</Button></div></CardTitle></CardHeader><CardContent className="space-y-4">{!reports ? <p className="text-sm text-slate-500">Loading report data...</p> : <><div className="grid gap-3 sm:grid-cols-6"><Card><CardContent className="p-3"><p className="text-[11px] text-slate-500">Users</p><p className="text-lg font-semibold">{reports.totals.users}</p></CardContent></Card><Card><CardContent className="p-3"><p className="text-[11px] text-slate-500">Active Users</p><p className="text-lg font-semibold">{reports.totals.activeUsers}</p></CardContent></Card><Card><CardContent className="p-3"><p className="text-[11px] text-slate-500">Unread Emails</p><p className="text-lg font-semibold">{reports.totals.unreadEmails}</p></CardContent></Card><Card><CardContent className="p-3"><p className="text-[11px] text-slate-500">Open Requests</p><p className="text-lg font-semibold">{reports.totals.openServiceRequests}</p></CardContent></Card><Card><CardContent className="p-3"><p className="text-[11px] text-slate-500">Sent Emails</p><p className="text-lg font-semibold">{reports.totals.sentEmails}</p></CardContent></Card><Card><CardContent className="p-3"><p className="text-[11px] text-slate-500">Audit Events</p><p className="text-lg font-semibold">{reports.totals.auditEvents}</p></CardContent></Card></div><p className="text-xs text-slate-500">Generated: {formatDateTime(reports.generatedAt, reports.timezone)} ({reports.timezone})</p><div className="overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Module</TableHead><TableHead>Total</TableHead><TableHead>Recent</TableHead><TableHead>Backlog</TableHead><TableHead>Trend</TableHead></TableRow></TableHeader><TableBody>{reports.modules.map((moduleRow) => (<TableRow key={moduleRow.moduleId}><TableCell className="text-xs font-medium">{moduleRow.label}</TableCell><TableCell className="text-xs">{moduleRow.total}</TableCell><TableCell className="text-xs">{moduleRow.recent}</TableCell><TableCell className="text-xs">{moduleRow.backlog}</TableCell><TableCell className="text-xs"><Badge variant="outline" className={cn(moduleRow.trend === "up" && "border-emerald-300 text-emerald-700", moduleRow.trend === "down" && "border-amber-300 text-amber-700")}>{moduleRow.trend}</Badge></TableCell></TableRow>))}</TableBody></Table></div><div className="overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Score</TableHead><TableHead>Tasks</TableHead><TableHead>Tickets</TableHead><TableHead>Emails Sent</TableHead><TableHead>Last Activity</TableHead></TableRow></TableHeader><TableBody>{reports.employees.slice(0, 25).map((employee) => (<TableRow key={employee.userId}><TableCell className="text-xs"><div className="font-medium">{employee.name}</div><div className="text-[11px] text-slate-500">{employee.email}</div></TableCell><TableCell className="text-xs">{employee.department || "-"}</TableCell><TableCell className="text-xs"><Badge variant="outline" className={cn(employee.activityScore >= 75 && "border-emerald-300 text-emerald-700", employee.activityScore < 45 && "border-rose-300 text-rose-700")}>{employee.activityScore}</Badge></TableCell><TableCell className="text-xs">{employee.tasksCompleted}/{employee.tasksAssigned}{employee.tasksOverdue > 0 ? ` (${employee.tasksOverdue} overdue)` : ""}</TableCell><TableCell className="text-xs">{employee.ticketsClosed}/{employee.ticketsAssigned}</TableCell><TableCell className="text-xs">{employee.emailsSent}</TableCell><TableCell className="text-xs">{formatDateTime(employee.lastActivity, reports.timezone)}</TableCell></TableRow>))}</TableBody></Table></div>{reports.insight ? <Card className="border-[#AA8038]/20 bg-[#AA8038]/5"><CardHeader><CardTitle className="text-sm">AI Report Summary</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>{reports.insight.summary}</p>{reports.insight.highlights.length > 0 ? <div><p className="text-xs font-semibold uppercase text-slate-500">Highlights</p><ul className="mt-1 space-y-1 text-xs text-slate-700">{reports.insight.highlights.map((item, idx) => (<li key={`h-${idx}`}>- {item}</li>))}</ul></div> : null}{reports.insight.risks.length > 0 ? <div><p className="text-xs font-semibold uppercase text-slate-500">Risks</p><ul className="mt-1 space-y-1 text-xs text-slate-700">{reports.insight.risks.map((item, idx) => (<li key={`r-${idx}`}>- {item}</li>))}</ul></div> : null}{reports.insight.actions.length > 0 ? <div><p className="text-xs font-semibold uppercase text-slate-500">Actions</p><ul className="mt-1 space-y-1 text-xs text-slate-700">{reports.insight.actions.map((item, idx) => (<li key={`a-${idx}`}>- {item}</li>))}</ul></div> : null}</CardContent></Card> : null}</>}</CardContent></Card>
          ) : null}

          {section === "logs" ? (
            <Card><CardHeader><CardTitle className="text-sm">Audit Logs ({logs.length})</CardTitle></CardHeader><CardContent><Button size="sm" variant="outline" onClick={() => void loadLogs()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button><div className="mt-3 max-h-[420px] overflow-auto border"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Module</TableHead><TableHead>Details</TableHead></TableRow></TableHeader><TableBody>{logs.map((log) => (<TableRow key={log.id}><TableCell className="text-xs">{formatDateTime(log.createdAt, settingsForm.defaultTimezone)}</TableCell><TableCell className="text-xs">{log.user?.name ?? "System"}</TableCell><TableCell><Badge variant="secondary" className="text-xs">{log.action}</Badge></TableCell><TableCell className="text-xs">{log.module}</TableCell><TableCell className="text-xs">{log.details || "-"}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
          ) : null}
        </div>

        <Dialog open={departmentDialogOpen} onOpenChange={(open) => { if (!departmentSaving) setDepartmentDialogOpen(open); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#AA8038]" />
                Department Management
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-1">
              <div className="flex items-center gap-2">
                <Input
                  value={departmentNameInput}
                  onChange={(event) => setDepartmentNameInput(event.target.value)}
                  placeholder="Add new department..."
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addDepartmentToDraft();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addDepartmentToDraft}>
                  Add
                </Button>
              </div>

              <div className="max-h-[340px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-20 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departmentDraft.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-xs text-slate-500">
                          No departments yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      departmentDraft
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((department) => (
                          <TableRow key={`dept-draft-${department.id}`}>
                            <TableCell>
                              <Input
                                value={department.name}
                                onChange={(event) =>
                                  setDepartmentDraft((prev) =>
                                    prev.map((item) =>
                                      item.id === department.id
                                        ? { ...item, name: event.target.value }
                                        : item
                                    )
                                  )
                                }
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={department.isActive}
                                  onChange={(event) =>
                                    setDepartmentDraft((prev) =>
                                      prev.map((item) =>
                                        item.id === department.id
                                          ? { ...item, isActive: event.target.checked, updatedAt: new Date().toISOString() }
                                          : item
                                      )
                                    )
                                  }
                                />
                                {department.isActive ? "Active" : "Inactive"}
                              </label>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-red-600 hover:text-red-700"
                                onClick={() =>
                                  setDepartmentDraft((prev) => prev.filter((item) => item.id !== department.id))
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-slate-500">
                Inactive departments stay in history but are hidden from new user assignment.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!departmentSaving) {
                    setDepartmentDialogOpen(false);
                    setDepartmentDraft([]);
                    setDepartmentNameInput("");
                  }
                }}
                disabled={departmentSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                style={{ backgroundColor: "#AA8038", color: "#fff" }}
                onClick={() => void saveDepartments()}
                disabled={!canManage || departmentSaving}
              >
                {departmentSaving ? "Saving..." : "Save Departments"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={createUserOpen}
          onOpenChange={(open) => {
            setCreateUserOpen(open);
            if (!open && !createUserSaving) {
              setNewUserForm(EMPTY_NEW_USER_FORM);
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-1">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-login">Login *</Label>
                  <Input
                    id="new-user-login"
                    value={newUserForm.login}
                    onChange={(event) => setNewUserForm((prev) => ({ ...prev, login: event.target.value }))}
                    placeholder="john.doe"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-email">Email *</Label>
                  <Input
                    id="new-user-email"
                    type="email"
                    value={newUserForm.email}
                    onChange={(event) => setNewUserForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-name">First Name *</Label>
                  <Input
                    id="new-user-name"
                    value={newUserForm.name}
                    onChange={(event) => setNewUserForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="John"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-surname">Last Name</Label>
                  <Input
                    id="new-user-surname"
                    value={newUserForm.surname}
                    onChange={(event) => setNewUserForm((prev) => ({ ...prev, surname: event.target.value }))}
                    placeholder="Doe"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="new-user-fullname">Display Name</Label>
                  <Input
                    id="new-user-fullname"
                    value={newUserForm.fullname}
                    onChange={(event) => setNewUserForm((prev) => ({ ...prev, fullname: event.target.value }))}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-position">Position</Label>
                  <Input
                    id="new-user-position"
                    value={newUserForm.position}
                    onChange={(event) => setNewUserForm((prev) => ({ ...prev, position: event.target.value }))}
                    placeholder="Team Lead"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-department">Department</Label>
                  <div className="flex gap-2">
                    <Input
                      id="new-user-department"
                      list="department-options"
                      value={newUserForm.department}
                      onChange={(event) => setNewUserForm((prev) => ({ ...prev, department: event.target.value }))}
                      placeholder="Operations"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={openDepartmentDialog}
                      disabled={!canManage}
                    >
                      Manage
                    </Button>
                  </div>
                  <datalist id="department-options">
                    {departments
                      .filter((department) => department.isActive)
                      .map((department) => (
                        <option key={`dept-option-${department.id}`} value={department.name} />
                      ))}
                  </datalist>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="new-user-password">Password *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="new-user-password"
                      type="text"
                      autoComplete="new-password"
                      value={newUserForm.password}
                      onChange={(event) => setNewUserForm((prev) => ({ ...prev, password: event.target.value }))}
                      placeholder={`At least ${Math.max(8, Number(securityForm.minPasswordLength || 8))} characters`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setNewUserForm((prev) => ({ ...prev, password: generateStrongPassword() }))}
                    >
                      <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                      Generate
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Initial Roles</p>
                {roles.length === 0 ? (
                  <p className="text-xs text-slate-500">No roles available yet.</p>
                ) : (
                  <div className="grid gap-1 sm:grid-cols-2">
                    {roles.map((role) => (
                      <label key={`new-role-${role.id}`} className="flex items-center justify-between rounded border px-2 py-1.5 text-sm">
                        <span>{role.name}</span>
                        <input
                          type="checkbox"
                          checked={newUserForm.roleIds.includes(role.id)}
                          onChange={(event) =>
                            setNewUserForm((prev) => ({
                              ...prev,
                              roleIds: event.target.checked
                                ? Array.from(new Set([...prev.roleIds, role.id]))
                                : prev.roleIds.filter((id) => id !== role.id),
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 rounded-md border p-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newUserForm.isActive}
                    onChange={(event) => setNewUserForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                  />
                  Active user
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newUserForm.isAdmin}
                    onChange={(event) => setNewUserForm((prev) => ({ ...prev, isAdmin: event.target.checked }))}
                  />
                  Administrator
                </label>
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateUserOpen(false);
                  setNewUserForm(EMPTY_NEW_USER_FORM);
                }}
                disabled={createUserSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                style={{ backgroundColor: "#AA8038", color: "#fff" }}
                onClick={() => void createUser()}
                disabled={
                  !canManage ||
                  createUserSaving ||
                  !newUserForm.login.trim() ||
                  !newUserForm.email.trim() ||
                  !newUserForm.name.trim() ||
                  newUserForm.password.trim().length < Math.max(8, Number(securityForm.minPasswordLength || 8))
                }
              >
                {createUserSaving ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={emailConfigOpen} onOpenChange={(open) => { if (!open) setEmailConfigOpen(false); }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Email Configuration</DialogTitle>
              <DialogDescription>Configure IMAP/SMTP settings for this user</DialogDescription>
            </DialogHeader>
            {userEmailConfig ? (
              <div className="grid gap-4 py-4">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={userEmailConfig.isEnabled}
                      onChange={(e) => setUserEmailConfig(prev => prev ? { ...prev, isEnabled: e.target.checked } : null)} />
                    Enable email sync
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">IMAP (Incoming)</h4>
                    <Input placeholder="IMAP Host" value={userEmailConfig.imapHost} onChange={(e) => setUserEmailConfig(p => p ? {...p, imapHost: e.target.value} : null)} />
                    <div className="flex gap-2 items-center">
                      <Input type="number" placeholder="Port" className="w-24" value={userEmailConfig.imapPort} onChange={(e) => setUserEmailConfig(p => p ? {...p, imapPort: Number(e.target.value)} : null)} />
                      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={userEmailConfig.imapSsl} onChange={(e) => setUserEmailConfig(p => p ? {...p, imapSsl: e.target.checked} : null)} /> SSL</label>
                    </div>
                    <Input placeholder="Login" value={userEmailConfig.imapLogin} onChange={(e) => setUserEmailConfig(p => p ? {...p, imapLogin: e.target.value} : null)} />
                    <Input type="password" placeholder="Password" value={userEmailConfig.imapPassword} onChange={(e) => setUserEmailConfig(p => p ? {...p, imapPassword: e.target.value} : null)} />
                  </div>
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">SMTP (Outgoing)</h4>
                    <Input placeholder="SMTP Host" value={userEmailConfig.smtpHost} onChange={(e) => setUserEmailConfig(p => p ? {...p, smtpHost: e.target.value} : null)} />
                    <div className="flex gap-2 items-center">
                      <Input type="number" placeholder="Port" className="w-24" value={userEmailConfig.smtpPort} onChange={(e) => setUserEmailConfig(p => p ? {...p, smtpPort: Number(e.target.value)} : null)} />
                      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={userEmailConfig.smtpSsl} onChange={(e) => setUserEmailConfig(p => p ? {...p, smtpSsl: e.target.checked} : null)} /> SSL/TLS</label>
                    </div>
                    <Input placeholder="Login" value={userEmailConfig.smtpLogin} onChange={(e) => setUserEmailConfig(p => p ? {...p, smtpLogin: e.target.value} : null)} />
                    <Input type="password" placeholder="Password" value={userEmailConfig.smtpPassword} onChange={(e) => setUserEmailConfig(p => p ? {...p, smtpPassword: e.target.value} : null)} />
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">From Address</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Input placeholder="From Name" value={userEmailConfig.fromName} onChange={(e) => setUserEmailConfig(p => p ? {...p, fromName: e.target.value} : null)} />
                    <Input type="email" placeholder="From Email" value={userEmailConfig.fromEmail} onChange={(e) => setUserEmailConfig(p => p ? {...p, fromEmail: e.target.value} : null)} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEmailConfigOpen(false)}>Cancel</Button>
              <Button onClick={() => void saveUserEmailConfig()} disabled={savingEmailConfig || !userEmailConfig} className="bg-[#AA8038] text-white hover:bg-[#CC8500]">
                {savingEmailConfig ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Config
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </div>
  );
}

