import { prisma } from "@/lib/prisma";

export const LEAD_STAGE_SETTING_KEY = "leads.pipeline.stages";
export const LEAD_SOURCE_OPTIONS_KEY = "leads.source.options";
export const LEAD_FORM_FIELDS_KEY = "leads.form.fields";
export const LEAD_CUSTOM_FIELDS_KEY = "leads.custom.fields";

// ─── Custom Fields ────────────────────────────────────────────────────────────

export type LeadCustomFieldType = "text" | "textarea" | "number" | "checkbox" | "dropdown" | "date";

const VALID_CUSTOM_FIELD_TYPES: LeadCustomFieldType[] = ["text", "textarea", "number", "checkbox", "dropdown", "date"];

export type LeadCustomField = {
  id: string;
  type: LeadCustomFieldType;
  label: string;
  enabled: boolean;
  required: boolean;
  order: number;
  placeholder: string;
  options: string[]; // for dropdown type only
};

export function sanitizeLeadCustomFields(input: unknown): LeadCustomField[] {
  if (!Array.isArray(input)) return [];

  const result: LeadCustomField[] = [];
  const seenIds = new Set<string>();

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const src = entry as Record<string, unknown>;

    const id = typeof src.id === "string" && src.id.trim() ? src.id.trim().slice(0, 64) : null;
    if (!id || seenIds.has(id)) continue;

    const type: LeadCustomFieldType = VALID_CUSTOM_FIELD_TYPES.includes(src.type as LeadCustomFieldType)
      ? (src.type as LeadCustomFieldType)
      : "text";

    const label = typeof src.label === "string" ? src.label.trim().slice(0, 64) : "";
    if (!label) continue;

    const placeholder = typeof src.placeholder === "string" ? src.placeholder.trim().slice(0, 128) : "";
    const enabled = src.enabled !== false;
    const required = Boolean(src.required) && enabled;
    const orderRaw = typeof src.order === "number" ? src.order : parseInt(String(src.order ?? ""), 10);
    const order = Number.isFinite(orderRaw) ? Math.max(1, Math.min(9999, Math.round(orderRaw))) : 100 + result.length;

    const options: string[] = [];
    if (type === "dropdown" && Array.isArray(src.options)) {
      for (const opt of src.options) {
        if (typeof opt === "string" && opt.trim()) {
          options.push(opt.trim().slice(0, 64));
          if (options.length >= 50) break;
        }
      }
    }

    result.push({ id, type, label, enabled, required, order, placeholder, options });
    seenIds.add(id);
    if (result.length >= 50) break;
  }

  return result.sort((a, b) => a.order - b.order);
}

export function parseLeadCustomFieldsSetting(raw: string | null | undefined): LeadCustomField[] {
  if (!raw?.trim()) return [];
  try {
    return sanitizeLeadCustomFields(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function loadLeadCustomFields(): Promise<LeadCustomField[]> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: LEAD_CUSTOM_FIELDS_KEY },
    select: { value: true },
  });
  return parseLeadCustomFieldsSetting(setting?.value);
}

export const DEFAULT_LEAD_STAGE_FLOW = ["new", "qualified", "proposal", "negotiation", "won"] as const;
export const DEFAULT_LEAD_SOURCE_OPTIONS = [
  "Website",
  "Referral",
  "Cold Call",
  "Social Media",
  "Campaign",
  "Partner",
] as const;

const TERMINAL_STAGE_SET = new Set(["won", "lost", "archived"]);

export const LEAD_FORM_FIELD_IDS = [
  "title",
  "companyName",
  "contactName",
  "email",
  "phone",
  "country",
  "language",
  "source",
  "priority",
  "notes",
] as const;

export type LeadFormFieldId = (typeof LEAD_FORM_FIELD_IDS)[number];

export type LeadFormFieldConfig = {
  id: LeadFormFieldId;
  label: string;
  enabled: boolean;
  required: boolean;
  order: number;
  placeholder: string;
};

const LEAD_FORM_FIELD_DEFAULTS: ReadonlyArray<LeadFormFieldConfig> = [
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

function normalizeStageKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

function normalizeOptionLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function getDefaultLeadFormFields() {
  return LEAD_FORM_FIELD_DEFAULTS.map((field) => ({ ...field }));
}

function normalizeFieldId(value: unknown): LeadFormFieldId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return LEAD_FORM_FIELD_IDS.includes(normalized as LeadFormFieldId)
    ? (normalized as LeadFormFieldId)
    : null;
}

export function sanitizeLeadFormFields(input: unknown): LeadFormFieldConfig[] {
  if (!Array.isArray(input)) return getDefaultLeadFormFields();

  const defaults = getDefaultLeadFormFields();
  const defaultMap = new Map(defaults.map((field) => [field.id, field]));
  const seen = new Set<LeadFormFieldId>();
  const result: LeadFormFieldConfig[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    const id = normalizeFieldId(source.id);
    if (!id || seen.has(id)) continue;
    const fallback = defaultMap.get(id);
    if (!fallback) continue;

    const labelRaw = typeof source.label === "string" ? source.label.trim() : "";
    const placeholderRaw =
      typeof source.placeholder === "string" ? source.placeholder.trim() : "";
    const orderRaw =
      typeof source.order === "number"
        ? source.order
        : Number.parseInt(String(source.order ?? ""), 10);
    const enabledRaw = source.enabled !== false;
    const requiredRaw = Boolean(source.required);

    const locked = id === "title" || id === "companyName";
    result.push({
      id,
      label: labelRaw.slice(0, 64) || fallback.label,
      placeholder: placeholderRaw.slice(0, 120) || fallback.placeholder,
      order: Number.isFinite(orderRaw) ? Math.max(1, Math.min(1000, orderRaw)) : fallback.order,
      enabled: locked ? true : enabledRaw,
      required: locked ? true : enabledRaw ? requiredRaw : false,
    });
    seen.add(id);
  }

  for (const field of defaults) {
    if (seen.has(field.id)) continue;
    result.push({ ...field });
  }

  result.sort((a, b) => a.order - b.order);
  return result.map((field, index) => ({
    ...field,
    order: index + 1,
    enabled: field.id === "title" || field.id === "companyName" ? true : field.enabled,
    required:
      field.id === "title" || field.id === "companyName"
        ? true
        : field.enabled
        ? field.required
        : false,
  }));
}

export function parseLeadFormFieldsSetting(raw: string | null | undefined): LeadFormFieldConfig[] {
  if (!raw?.trim()) return getDefaultLeadFormFields();

  try {
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeLeadFormFields(parsed);
  } catch {
    return getDefaultLeadFormFields();
  }
}

export function toLeadStageLabel(stage: string) {
  const normalized = normalizeStageKey(stage);
  if (!normalized) return "Unknown";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function sanitizeLeadStageFlow(input: unknown): string[] {
  if (!Array.isArray(input)) return [...DEFAULT_LEAD_STAGE_FLOW];

  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const value of input) {
    if (typeof value !== "string") continue;
    const stage = normalizeStageKey(value);
    if (!stage || seen.has(stage)) continue;
    if (stage === "lost" || stage === "archived") continue;

    seen.add(stage);
    ordered.push(stage);
  }

  if (!ordered.includes("won")) {
    ordered.push("won");
  }

  return ordered.length > 1 ? ordered : [...DEFAULT_LEAD_STAGE_FLOW];
}

export function parseLeadStageFlowSetting(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [...DEFAULT_LEAD_STAGE_FLOW];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeLeadStageFlow(parsed);
  } catch {
    return [...DEFAULT_LEAD_STAGE_FLOW];
  }
}

export function sanitizeLeadSourceOptions(input: unknown): string[] {
  if (!Array.isArray(input)) return [...DEFAULT_LEAD_SOURCE_OPTIONS];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of input) {
    if (typeof value !== "string") continue;
    const normalized = normalizeOptionLabel(value);
    const dedupKey = normalized.toLowerCase();
    if (!normalized || seen.has(dedupKey)) continue;

    seen.add(dedupKey);
    result.push(normalized.slice(0, 64));

    if (result.length >= 50) break;
  }

  return result.length ? result : [...DEFAULT_LEAD_SOURCE_OPTIONS];
}

export function parseLeadSourceOptionsSetting(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [...DEFAULT_LEAD_SOURCE_OPTIONS];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeLeadSourceOptions(parsed);
  } catch {
    return [...DEFAULT_LEAD_SOURCE_OPTIONS];
  }
}

export async function loadLeadStageFlow() {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: LEAD_STAGE_SETTING_KEY },
    select: { value: true },
  });

  return parseLeadStageFlowSetting(setting?.value);
}

export async function loadLeadSourceOptions() {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: LEAD_SOURCE_OPTIONS_KEY },
    select: { value: true },
  });

  return parseLeadSourceOptionsSetting(setting?.value);
}

export async function loadLeadFormFields() {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: LEAD_FORM_FIELDS_KEY },
    select: { value: true },
  });
  return parseLeadFormFieldsSetting(setting?.value);
}

export function isTerminalLeadStage(stage: string | null | undefined) {
  if (!stage) return false;
  return TERMINAL_STAGE_SET.has(normalizeStageKey(stage));
}

export function statusForLeadStage(stage: string | null | undefined) {
  const normalized = normalizeStageKey(stage ?? "");
  if (normalized === "won") return "won";
  if (normalized === "lost") return "lost";
  if (normalized === "archived") return "archived";
  return "open";
}

export function getNextLeadStage(currentStage: string | null | undefined, stageFlow: string[]) {
  const normalizedCurrent = normalizeStageKey(currentStage ?? "");
  if (!normalizedCurrent || isTerminalLeadStage(normalizedCurrent)) {
    return null;
  }

  const normalizedFlow = sanitizeLeadStageFlow(stageFlow);
  const idx = normalizedFlow.findIndex((stage) => stage === normalizedCurrent);

  if (idx < 0) {
    return normalizedFlow[0] ?? null;
  }

  if (idx >= normalizedFlow.length - 1) {
    return null;
  }

  return normalizedFlow[idx + 1];
}

export function normalizeLeadStage(stage: string | null | undefined) {
  const normalized = normalizeStageKey(stage ?? "");
  return normalized || DEFAULT_LEAD_STAGE_FLOW[0];
}
