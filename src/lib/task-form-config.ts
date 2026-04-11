import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

export const TASK_FORM_SCHEMA_SETTING_KEY = "tasks.form.schema.v1";

export type TaskFormPane = "main" | "side";

export type TaskFormFieldType =
  | "text"
  | "select"
  | "date"
  | "actions"
  | "rich_text"
  | "file"
  | "assignees"
  | "checkbox";

export type TaskFormRowColumns = 1 | 2 | 3 | 4;

export type TaskFormCoreFieldKey =
  | "title"
  | "type"
  | "status"
  | "priority"
  | "dueDate"
  | "duePresets"
  | "description"
  | "attachments"
  | "assignees"
  | "privateTask";

export type TaskFormField = {
  id: string;
  key: string;
  label: string;
  type: TaskFormFieldType;
  source: "core";
  coreKey: TaskFormCoreFieldKey;
  enabled: boolean;
  required: boolean;
  order: number;
  helpText: string;
  pane: TaskFormPane;
  layoutRow: number;
  layoutColumns: TaskFormRowColumns;
  layoutColSpan: number;
};

const VALID_LAYOUT_COLUMNS: TaskFormRowColumns[] = [1, 2, 3, 4];
const VALID_PANES: TaskFormPane[] = ["main", "side"];
const VALID_CORE_KEYS: TaskFormCoreFieldKey[] = [
  "title",
  "type",
  "status",
  "priority",
  "dueDate",
  "duePresets",
  "description",
  "attachments",
  "assignees",
  "privateTask",
];

const CORE_FIELD_DEFAULTS: ReadonlyArray<TaskFormField> = [
  {
    id: "core_title",
    key: "title",
    label: "Subject",
    type: "text",
    source: "core",
    coreKey: "title",
    enabled: true,
    required: true,
    order: 1,
    helpText: "",
    pane: "main",
    layoutRow: 1,
    layoutColumns: 1,
    layoutColSpan: 1,
  },
  {
    id: "core_type",
    key: "type",
    label: "Type",
    type: "select",
    source: "core",
    coreKey: "type",
    enabled: true,
    required: true,
    order: 2,
    helpText: "",
    pane: "main",
    layoutRow: 2,
    layoutColumns: 2,
    layoutColSpan: 1,
  },
  {
    id: "core_status",
    key: "status",
    label: "Status",
    type: "select",
    source: "core",
    coreKey: "status",
    enabled: true,
    required: true,
    order: 3,
    helpText: "",
    pane: "main",
    layoutRow: 2,
    layoutColumns: 2,
    layoutColSpan: 1,
  },
  {
    id: "core_priority",
    key: "priority",
    label: "Priority",
    type: "select",
    source: "core",
    coreKey: "priority",
    enabled: true,
    required: true,
    order: 4,
    helpText: "",
    pane: "main",
    layoutRow: 3,
    layoutColumns: 2,
    layoutColSpan: 1,
  },
  {
    id: "core_due_date",
    key: "dueDate",
    label: "Deadline",
    type: "date",
    source: "core",
    coreKey: "dueDate",
    enabled: true,
    required: false,
    order: 5,
    helpText: "",
    pane: "main",
    layoutRow: 3,
    layoutColumns: 2,
    layoutColSpan: 1,
  },
  {
    id: "core_due_presets",
    key: "duePresets",
    label: "Deadline Presets",
    type: "actions",
    source: "core",
    coreKey: "duePresets",
    enabled: true,
    required: false,
    order: 6,
    helpText: "",
    pane: "main",
    layoutRow: 4,
    layoutColumns: 1,
    layoutColSpan: 1,
  },
  {
    id: "core_description",
    key: "description",
    label: "Description",
    type: "rich_text",
    source: "core",
    coreKey: "description",
    enabled: true,
    required: false,
    order: 7,
    helpText: "",
    pane: "main",
    layoutRow: 5,
    layoutColumns: 1,
    layoutColSpan: 1,
  },
  {
    id: "core_attachments",
    key: "attachments",
    label: "Attachments",
    type: "file",
    source: "core",
    coreKey: "attachments",
    enabled: true,
    required: false,
    order: 8,
    helpText: "",
    pane: "main",
    layoutRow: 6,
    layoutColumns: 1,
    layoutColSpan: 1,
  },
  {
    id: "core_assignees",
    key: "assignees",
    label: "Assignees",
    type: "assignees",
    source: "core",
    coreKey: "assignees",
    enabled: true,
    required: false,
    order: 9,
    helpText: "",
    pane: "side",
    layoutRow: 1,
    layoutColumns: 1,
    layoutColSpan: 1,
  },
  {
    id: "core_private",
    key: "privateTask",
    label: "Private Task",
    type: "checkbox",
    source: "core",
    coreKey: "privateTask",
    enabled: true,
    required: false,
    order: 10,
    helpText: "",
    pane: "side",
    layoutRow: 2,
    layoutColumns: 1,
    layoutColSpan: 1,
  },
];

function normalizeKey(input: unknown, fallback: string) {
  const raw = typeof input === "string" ? input : fallback;
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || fallback;
}

function sanitizeLayoutRow(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, Math.round(parsed)));
}

function sanitizeLayoutColumns(value: unknown, fallback: TaskFormRowColumns): TaskFormRowColumns {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.max(1, Math.min(4, Math.round(parsed)));
  if (VALID_LAYOUT_COLUMNS.includes(normalized as TaskFormRowColumns)) {
    return normalized as TaskFormRowColumns;
  }
  return fallback;
}

function sanitizeLayoutColSpan(value: unknown, columns: TaskFormRowColumns): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(columns, Math.round(parsed)));
}

function sanitizePane(value: unknown, fallback: TaskFormPane): TaskFormPane {
  if (typeof value !== "string") return fallback;
  return VALID_PANES.includes(value as TaskFormPane) ? (value as TaskFormPane) : fallback;
}

function resolveCoreKey(input: unknown): TaskFormCoreFieldKey | null {
  if (typeof input !== "string") return null;
  return VALID_CORE_KEYS.includes(input as TaskFormCoreFieldKey)
    ? (input as TaskFormCoreFieldKey)
    : null;
}

export function getDefaultTaskFormFields(): TaskFormField[] {
  return CORE_FIELD_DEFAULTS.map((field) => ({ ...field }));
}

export function sanitizeTaskFormFields(input: unknown): TaskFormField[] {
  const defaults = getDefaultTaskFormFields();
  const defaultByCore = new Map(defaults.map((field) => [field.coreKey, field]));
  const result: TaskFormField[] = [];
  const seen = new Set<TaskFormCoreFieldKey>();

  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      const source = item as Record<string, unknown>;
      const coreKey =
        resolveCoreKey(source.coreKey) ??
        resolveCoreKey(source.key) ??
        resolveCoreKey(source.id?.toString().replace(/^core_/, ""));
      if (!coreKey) continue;
      if (seen.has(coreKey)) continue;
      seen.add(coreKey);

      const fallback = defaultByCore.get(coreKey);
      if (!fallback) continue;

      const orderRaw =
        typeof source.order === "number"
          ? source.order
          : Number.parseInt(String(source.order ?? ""), 10);
      const order = Number.isFinite(orderRaw)
        ? Math.max(1, Math.min(500, Math.round(orderRaw)))
        : fallback.order;
      const layoutRow = sanitizeLayoutRow(source.layoutRow, fallback.layoutRow);
      const layoutColumns = sanitizeLayoutColumns(source.layoutColumns, fallback.layoutColumns);
      const layoutColSpan = sanitizeLayoutColSpan(source.layoutColSpan, layoutColumns);
      const pane = sanitizePane(source.pane, fallback.pane);
      const required = coreKey === "title" ? true : Boolean(source.required);
      const enabled = coreKey === "title" ? true : source.enabled !== false;

      result.push({
        id: normalizeKey(source.id, fallback.id),
        key: normalizeKey(source.key, fallback.key),
        label:
          (typeof source.label === "string" ? source.label.trim() : "").slice(0, 120) ||
          fallback.label,
        type: fallback.type,
        source: "core",
        coreKey,
        enabled,
        required,
        order,
        helpText: (typeof source.helpText === "string" ? source.helpText.trim() : "").slice(0, 300),
        pane,
        layoutRow,
        layoutColumns,
        layoutColSpan,
      });
    }
  }

  for (const fallback of defaults) {
    if (result.some((field) => field.coreKey === fallback.coreKey)) continue;
    result.push({ ...fallback });
  }

  return result
    .sort((a, b) => {
      if (a.pane !== b.pane) return a.pane === "main" ? -1 : 1;
      if (a.layoutRow !== b.layoutRow) return a.layoutRow - b.layoutRow;
      return a.order - b.order;
    })
    .map((field, index) => ({ ...field, order: index + 1 }));
}

export function parseTaskFormFieldsSetting(raw: string | null | undefined): TaskFormField[] {
  if (!raw?.trim()) return getDefaultTaskFormFields();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeTaskFormFields(parsed);
  } catch {
    return getDefaultTaskFormFields();
  }
}

export async function loadTaskFormFields(db?: PrismaClient): Promise<TaskFormField[]> {
  const actualDb = db ?? prisma;
  const setting = await actualDb.systemSetting.findUnique({
    where: { key: TASK_FORM_SCHEMA_SETTING_KEY },
    select: { value: true },
  });
  return parseTaskFormFieldsSetting(setting?.value);
}

