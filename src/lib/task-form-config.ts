import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

export const TASK_FORM_SCHEMA_SETTING_KEY = "tasks.form.schema.v1";

export type TaskFormPane = "main" | "side";

export type TaskFormFieldType =
  | "text"
  | "textarea"
  | "rich_text"
  | "number"
  | "date"
  | "datetime"
  | "checkbox"
  | "select"
  | "multiselect"
  | "file"
  | "url"
  | "email"
  | "phone"
  | "actions"
  | "assignees";

export type TaskFormRowColumns = 1 | 2 | 3 | 4;

export type TaskCoreFieldKey =
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

export type TaskFileMetadataField = {
  id: string;
  key: string;
  label: string;
  type: Exclude<TaskFormFieldType, "file" | "rich_text" | "multiselect" | "actions" | "assignees">;
  required: boolean;
  placeholder: string;
  options: string[];
};

export type TaskFormField = {
  id: string;
  key: string;
  label: string;
  type: TaskFormFieldType;
  source: "core" | "custom";
  coreKey: TaskCoreFieldKey | null;
  enabled: boolean;
  required: boolean;
  order: number;
  placeholder: string;
  helpText: string;
  pane: TaskFormPane;
  layoutRow: number;
  layoutColumns: TaskFormRowColumns;
  layoutColSpan: number;
  options: string[];
  multiple: boolean;
  accept: string;
  metadataFields: TaskFileMetadataField[];
};

type FileEntry = {
  url: string;
  fileName: string;
  size: number;
  mimeType: string;
  metadata: Record<string, unknown>;
};

const VALID_TYPES: TaskFormFieldType[] = [
  "text",
  "textarea",
  "rich_text",
  "number",
  "date",
  "datetime",
  "checkbox",
  "select",
  "multiselect",
  "file",
  "url",
  "email",
  "phone",
  "actions",
  "assignees",
];

const VALID_META_TYPES: Array<TaskFileMetadataField["type"]> = [
  "text",
  "textarea",
  "number",
  "date",
  "datetime",
  "checkbox",
  "select",
  "url",
  "email",
  "phone",
];

const VALID_LAYOUT_COLUMNS: TaskFormRowColumns[] = [1, 2, 3, 4];
const VALID_PANES: TaskFormPane[] = ["main", "side"];

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
    placeholder: "",
    helpText: "",
    pane: "main",
    layoutRow: 1,
    layoutColumns: 1,
    layoutColSpan: 1,
    options: [],
    multiple: false,
    accept: "",
    metadataFields: [],
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
    placeholder: "",
    helpText: "",
    pane: "main",
    layoutRow: 2,
    layoutColumns: 2,
    layoutColSpan: 1,
    options: ["task", "event", "note"],
    multiple: false,
    accept: "",
    metadataFields: [],
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
    placeholder: "",
    helpText: "",
    pane: "main",
    layoutRow: 2,
    layoutColumns: 2,
    layoutColSpan: 1,
    options: [],
    multiple: false,
    accept: "",
    metadataFields: [],
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
    placeholder: "",
    helpText: "",
    pane: "main",
    layoutRow: 3,
    layoutColumns: 2,
    layoutColSpan: 1,
    options: ["high", "normal", "low"],
    multiple: false,
    accept: "",
    metadataFields: [],
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
    placeholder: "",
    helpText: "",
    pane: "main",
    layoutRow: 3,
    layoutColumns: 2,
    layoutColSpan: 1,
    options: [],
    multiple: false,
    accept: "",
    metadataFields: [],
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
    placeholder: "",
    helpText: "",
    pane: "main",
    layoutRow: 4,
    layoutColumns: 1,
    layoutColSpan: 1,
    options: [],
    multiple: false,
    accept: "",
    metadataFields: [],
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
    placeholder: "Write task description...",
    helpText: "",
    pane: "main",
    layoutRow: 5,
    layoutColumns: 1,
    layoutColSpan: 1,
    options: [],
    multiple: false,
    accept: "",
    metadataFields: [],
  },
  {
    id: "core_attachments",
    key: "attachments",
    label: "Attach file",
    type: "file",
    source: "core",
    coreKey: "attachments",
    enabled: true,
    required: false,
    order: 8,
    placeholder: "",
    helpText: "",
    pane: "main",
    layoutRow: 6,
    layoutColumns: 1,
    layoutColSpan: 1,
    options: [],
    multiple: true,
    accept: "",
    metadataFields: [],
  },
  {
    id: "core_assignees",
    key: "assignees",
    label: "Assigned to",
    type: "assignees",
    source: "core",
    coreKey: "assignees",
    enabled: true,
    required: false,
    order: 9,
    placeholder: "",
    helpText: "",
    pane: "side",
    layoutRow: 1,
    layoutColumns: 1,
    layoutColSpan: 1,
    options: [],
    multiple: false,
    accept: "",
    metadataFields: [],
  },
  {
    id: "core_private",
    key: "privateTask",
    label: "Private task",
    type: "checkbox",
    source: "core",
    coreKey: "privateTask",
    enabled: true,
    required: false,
    order: 10,
    placeholder: "",
    helpText: "",
    pane: "side",
    layoutRow: 2,
    layoutColumns: 1,
    layoutColSpan: 1,
    options: [],
    multiple: false,
    accept: "",
    metadataFields: [],
  },
];

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
  return VALID_PANES.includes(value as TaskFormPane)
    ? (value as TaskFormPane)
    : fallback;
}

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

function dedupeOptions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of input) {
    if (typeof value !== "string") continue;
    const item = value.trim().slice(0, 120);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= 200) break;
  }
  return result;
}

function sanitizeMetadataFields(input: unknown): TaskFileMetadataField[] {
  if (!Array.isArray(input)) return [];
  const result: TaskFileMetadataField[] = [];
  const seenIds = new Set<string>();
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const src = entry as Record<string, unknown>;
    const id = normalizeKey(src.id, `meta_${result.length + 1}`);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const type = VALID_META_TYPES.includes(src.type as TaskFileMetadataField["type"])
      ? (src.type as TaskFileMetadataField["type"])
      : "text";
    const label = (typeof src.label === "string" ? src.label.trim() : "").slice(0, 120) || "Metadata";

    result.push({
      id,
      key: normalizeKey(src.key, id),
      label,
      type,
      required: Boolean(src.required),
      placeholder: (typeof src.placeholder === "string" ? src.placeholder.trim() : "").slice(0, 200),
      options: type === "select" ? dedupeOptions(src.options) : [],
    });
    if (result.length >= 25) break;
  }
  return result;
}

export function getDefaultTaskFormFields(): TaskFormField[] {
  return CORE_FIELD_DEFAULTS.map((field) => ({
    ...field,
    options: [...field.options],
    metadataFields: [],
  }));
}

export function sanitizeTaskFormFields(input: unknown): TaskFormField[] {
  const defaults = getDefaultTaskFormFields();
  const defaultByCore = new Map(defaults.map((field) => [field.coreKey, field]));
  const result: TaskFormField[] = [];
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();

  if (Array.isArray(input)) {
    for (const entry of input) {
      if (!entry || typeof entry !== "object") continue;
      const src = entry as Record<string, unknown>;
      const source = src.source === "core" ? "core" : "custom";
      const coreKey = source === "core" ? (src.coreKey as TaskCoreFieldKey | null) : null;
      const defaultCore = source === "core" ? defaultByCore.get(coreKey) : undefined;
      const id = normalizeKey(
        src.id,
        source === "core" ? `core_${String(coreKey ?? "field")}` : `field_${result.length + 1}`
      );
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const fallbackKey =
        source === "core"
          ? String(defaultCore?.key ?? coreKey ?? id)
          : `custom_${id}`;
      const key = normalizeKey(src.key, fallbackKey);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const type = VALID_TYPES.includes(src.type as TaskFormFieldType)
        ? (src.type as TaskFormFieldType)
        : (defaultCore?.type ?? "text");
      if (source === "custom" && (type === "actions" || type === "assignees")) continue;

      const label =
        (typeof src.label === "string" ? src.label.trim() : "").slice(0, 120) ||
        defaultCore?.label ||
        "Field";
      const orderRaw =
        typeof src.order === "number"
          ? src.order
          : Number.parseInt(String(src.order ?? ""), 10);
      const order = Number.isFinite(orderRaw)
        ? Math.max(1, Math.min(500, Math.round(orderRaw)))
        : 100 + result.length;
      const pane = sanitizePane(src.pane, defaultCore?.pane ?? "main");
      const layoutRow = sanitizeLayoutRow(src.layoutRow, order);
      const layoutColumns = sanitizeLayoutColumns(src.layoutColumns, defaultCore?.layoutColumns ?? 1);
      const layoutColSpan = sanitizeLayoutColSpan(src.layoutColSpan, layoutColumns);
      const resolvedCoreKey = source === "core" ? (coreKey ?? defaultCore?.coreKey ?? null) : null;
      const fieldOptions =
        type === "select" || type === "multiselect" ? dedupeOptions(src.options) : [];

      const requiredFromInput = Boolean(src.required);
      const enabledFromInput = src.enabled !== false;
      const required = resolvedCoreKey === "title" ? true : requiredFromInput;
      const enabled = resolvedCoreKey === "title" ? true : enabledFromInput;

      result.push({
        id,
        key,
        label,
        type,
        source,
        coreKey: resolvedCoreKey,
        enabled,
        required,
        order,
        placeholder: (typeof src.placeholder === "string" ? src.placeholder.trim() : "").slice(0, 200),
        helpText: (typeof src.helpText === "string" ? src.helpText.trim() : "").slice(0, 300),
        pane,
        layoutRow,
        layoutColumns,
        layoutColSpan,
        options: defaultCore?.coreKey === "status" ? [] : fieldOptions,
        multiple: type === "file" ? Boolean(src.multiple) : false,
        accept: type === "file" ? (typeof src.accept === "string" ? src.accept.trim().slice(0, 200) : "") : "",
        metadataFields: type === "file" ? sanitizeMetadataFields(src.metadataFields) : [],
      });
      if (result.length >= 140) break;
    }
  }

  for (const coreField of defaults) {
    if (result.some((entry) => entry.source === "core" && entry.coreKey === coreField.coreKey)) continue;
    result.push({ ...coreField, options: [...coreField.options], metadataFields: [] });
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

function sanitizeFileEntry(input: unknown, field: TaskFormField): FileEntry | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const url = typeof src.url === "string" ? src.url.trim().slice(0, 500) : "";
  if (!url) return null;
  const fileName = (typeof src.fileName === "string" ? src.fileName : "").trim().slice(0, 200) || "uploaded-file";
  const sizeRaw = typeof src.size === "number" ? src.size : Number.parseInt(String(src.size ?? "0"), 10);
  const size = Number.isFinite(sizeRaw) ? Math.max(0, sizeRaw) : 0;
  const mimeType = (typeof src.mimeType === "string" ? src.mimeType : "").trim().slice(0, 120);
  const metadata = src.metadata && typeof src.metadata === "object"
    ? (src.metadata as Record<string, unknown>)
    : {};
  const normalizedMetadata: Record<string, unknown> = {};
  for (const meta of field.metadataFields) {
    const value = metadata[meta.key];
    if (value === undefined || value === null || value === "") continue;
    if (meta.type === "checkbox") {
      normalizedMetadata[meta.key] = Boolean(value);
      continue;
    }
    if (meta.type === "number") {
      const parsed = Number.parseFloat(String(value));
      if (Number.isFinite(parsed)) normalizedMetadata[meta.key] = parsed;
      continue;
    }
    if (meta.type === "select") {
      const text = String(value).trim();
      if (!text) continue;
      if (meta.options.length === 0 || meta.options.includes(text)) {
        normalizedMetadata[meta.key] = text;
      }
      continue;
    }
    normalizedMetadata[meta.key] = String(value).trim().slice(0, 1000);
  }

  return { url, fileName, size, mimeType, metadata: normalizedMetadata };
}

export function sanitizeTaskCustomData(
  input: unknown,
  fields: TaskFormField[]
): Record<string, unknown> {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const result: Record<string, unknown> = {};
  const customFields = fields.filter((field) => field.enabled && field.source === "custom");

  for (const field of customFields) {
    const raw = source[field.key];
    if (raw === undefined || raw === null || raw === "") continue;

    if (field.type === "checkbox") {
      result[field.key] = Boolean(raw);
      continue;
    }
    if (field.type === "number") {
      const parsed = Number.parseFloat(String(raw));
      if (Number.isFinite(parsed)) result[field.key] = parsed;
      continue;
    }
    if (field.type === "multiselect") {
      const values = Array.isArray(raw) ? raw.map((item) => String(item).trim()) : [];
      const filtered = values.filter((item) => item && (field.options.length === 0 || field.options.includes(item)));
      if (filtered.length > 0) result[field.key] = filtered.slice(0, 100);
      continue;
    }
    if (field.type === "select") {
      const text = String(raw).trim();
      if (!text) continue;
      if (field.options.length === 0 || field.options.includes(text)) {
        result[field.key] = text;
      }
      continue;
    }
    if (field.type === "file") {
      const list = Array.isArray(raw) ? raw : [raw];
      const files = list
        .map((entry) => sanitizeFileEntry(entry, field))
        .filter((entry): entry is FileEntry => Boolean(entry));
      if (files.length > 0) {
        result[field.key] = field.multiple ? files : [files[0]];
      }
      continue;
    }

    const text = String(raw).trim();
    if (!text) continue;
    result[field.key] = text.slice(0, field.type === "rich_text" ? 100000 : 4000);
  }

  return result;
}

