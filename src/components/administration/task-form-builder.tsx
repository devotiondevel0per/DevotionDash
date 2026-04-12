"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { GripVertical, Plus, Save, Trash2 } from "lucide-react";
import type {
  TaskFileMetadataField,
  TaskFormFieldCondition,
  TaskFormField,
  TaskFormFieldType,
  TaskFormPane,
  TaskFormRowColumns,
} from "@/lib/task-form-config";

type Props = {
  canManage: boolean;
};

const DEFAULT_LEFT_PANEL_WIDTH = 460;
const MIN_LEFT_PANEL_WIDTH = 340;
const MIN_RIGHT_PANEL_WIDTH = 520;
const RESIZE_HANDLE_WIDTH = 12;

const FIELD_TYPE_OPTIONS: Array<{ value: TaskFormFieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "rich_text", label: "Rich Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "checkbox", label: "Checkbox" },
  { value: "select", label: "Dropdown (Single)" },
  { value: "multiselect", label: "Dropdown (Multiple)" },
  { value: "file", label: "File Upload" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

const META_TYPE_OPTIONS: Array<{ value: TaskFileMetadataField["type"]; label: string }> = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "checkbox", label: "Checkbox" },
  { value: "select", label: "Dropdown" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

const CUSTOM_TYPE_SET = new Set<TaskFormFieldType>(FIELD_TYPE_OPTIONS.map((entry) => entry.value));
const CONDITION_OPERATOR_OPTIONS: Array<{ value: TaskFormFieldCondition["operator"]; label: string }> = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Not Contains" },
  { value: "is_empty", label: "Is Empty" },
  { value: "is_not_empty", label: "Is Not Empty" },
];
const CONDITION_ACTION_OPTIONS: Array<{ value: TaskFormFieldCondition["action"]; label: string }> = [
  { value: "show", label: "Show Field" },
  { value: "require", label: "Require Field" },
  { value: "options", label: "Conditional Options" },
];

type PaneRows = Record<
  TaskFormPane,
  Array<{ row: number; columns: TaskFormRowColumns; fields: TaskFormField[] }>
>;

function normalizeKey(value: string, fallback: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || fallback
  );
}

function nextFieldOrder(fields: TaskFormField[]) {
  return fields.length > 0 ? Math.max(...fields.map((f) => f.order)) + 1 : 1;
}

function asOptionLines(lines: string) {
  return lines
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function supportsConditionalOptions(type: TaskFormFieldType) {
  return type === "select" || type === "multiselect";
}

function sanitizeTaskBuilderConditions(
  conditions: TaskFormField["conditions"],
  fieldKey: string,
  fieldType: TaskFormFieldType
): TaskFormFieldCondition[] {
  if (!Array.isArray(conditions)) return [];
  const canUseOptionRules = supportsConditionalOptions(fieldType);
  const seen = new Set<string>();
  const result: TaskFormFieldCondition[] = [];
  for (const condition of conditions) {
    if (!condition || typeof condition !== "object") continue;
    const id = normalizeKey(condition.id, `condition_${result.length + 1}`);
    if (seen.has(id)) continue;
    seen.add(id);
    const sourceKey = normalizeKey(condition.sourceKey, "");
    if (!sourceKey || sourceKey === fieldKey) continue;
    const action: TaskFormFieldCondition["action"] =
      condition.action === "require" || condition.action === "options" ? condition.action : "show";
    if (!canUseOptionRules && action === "options") continue;
    const operator: TaskFormFieldCondition["operator"] =
      condition.operator === "not_equals" ||
      condition.operator === "contains" ||
      condition.operator === "not_contains" ||
      condition.operator === "is_empty" ||
      condition.operator === "is_not_empty"
        ? condition.operator
        : "equals";
    result.push({
      id,
      sourceKey,
      operator,
      action,
      value: (condition.value ?? "").toString().trim().slice(0, 300),
      options: action === "options" ? asOptionLines((condition.options ?? []).join("\n")) : [],
      enabled: condition.enabled !== false,
    });
  }
  return result;
}

function clampRowColumns(value: unknown): TaskFormRowColumns {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(4, Math.round(parsed))) as TaskFormRowColumns;
}

function clampSpan(value: unknown, columns: TaskFormRowColumns) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(columns, Math.round(parsed)));
}

function normalizeRow(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, Math.round(parsed)));
}

function normalizePane(value: unknown, fallback: TaskFormPane): TaskFormPane {
  if (value === "main" || value === "side") return value;
  return fallback;
}

function isCoreTitleField(field: TaskFormField) {
  return field.source === "core" && field.coreKey === "title";
}

function getAutoTaskFieldSpan(field: TaskFormField, columns: TaskFormRowColumns) {
  if (columns <= 1) return 1;

  if (field.source === "core" && field.coreKey === "title") {
    return Math.min(columns, 2);
  }

  if (
    field.type === "rich_text" ||
    field.type === "textarea" ||
    field.type === "file" ||
    field.type === "actions" ||
    field.type === "assignees"
  ) {
    return columns;
  }

  if (
    field.type === "multiselect" ||
    field.type === "email" ||
    field.type === "url" ||
    field.type === "phone"
  ) {
    return Math.min(columns, 2);
  }

  if (field.type === "text") {
    const textHint = `${field.key} ${field.label}`.toLowerCase();
    if (/(name|title|subject|summary|description|address|comment|message|notes)/.test(textHint)) {
      return Math.min(columns, 2);
    }
  }

  return 1;
}

function getTaskFieldSpanMode(field: TaskFormField): "auto" | "manual" {
  return field.spanMode === "manual" ? "manual" : "auto";
}

function getEffectiveTaskFieldSpan(field: TaskFormField, columns: TaskFormRowColumns) {
  if (getTaskFieldSpanMode(field) === "manual") {
    return clampSpan(field.layoutColSpan, columns);
  }
  return getAutoTaskFieldSpan(field, columns);
}

function supportsTaskFiltering(type: TaskFormFieldType): boolean {
  return type !== "actions" && type !== "file";
}

function supportsTaskSorting(type: TaskFormFieldType): boolean {
  return type !== "actions" && type !== "file" && type !== "rich_text" && type !== "textarea";
}

function defaultTaskShowInList(field: Pick<TaskFormField, "source" | "coreKey" | "type">): boolean {
  if (field.source === "core") {
    return (
      field.coreKey === "title" ||
      field.coreKey === "status" ||
      field.coreKey === "priority" ||
      field.coreKey === "type" ||
      field.coreKey === "dueDate" ||
      field.coreKey === "description" ||
      field.coreKey === "assignees"
    );
  }
  return field.type !== "file";
}

function defaultTaskShowInGrid(field: Pick<TaskFormField, "source" | "coreKey" | "type">): boolean {
  if (field.source === "core") {
    return (
      field.coreKey === "title" ||
      field.coreKey === "status" ||
      field.coreKey === "priority" ||
      field.coreKey === "type" ||
      field.coreKey === "dueDate" ||
      field.coreKey === "description" ||
      field.coreKey === "assignees"
    );
  }
  return field.type !== "file";
}

export function TaskFormBuilder({ canManage }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);
  const [fields, setFields] = useState<TaskFormField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(DEFAULT_LEFT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const layoutRef = useRef<HTMLDivElement | null>(null);

  const clampLeftPanelWidth = useCallback((proposed: number) => {
    const containerWidth = layoutRef.current?.clientWidth ?? 0;
    if (containerWidth <= 0) {
      return Math.max(MIN_LEFT_PANEL_WIDTH, proposed);
    }
    const maxLeft = Math.max(
      MIN_LEFT_PANEL_WIDTH,
      containerWidth - MIN_RIGHT_PANEL_WIDTH - RESIZE_HANDLE_WIDTH
    );
    return Math.max(MIN_LEFT_PANEL_WIDTH, Math.min(maxLeft, proposed));
  }, []);

  function normalizeLayoutFields(nextFields: TaskFormField[]) {
    const normalized = nextFields
      .map((field, index) => {
        const pane = normalizePane(field.pane, "main");
        const row = normalizeRow(field.layoutRow, field.order || index + 1);
        const columns = clampRowColumns(field.layoutColumns);
        const spanMode = getTaskFieldSpanMode(field);
        const manualSpan = clampSpan(field.layoutColSpan, columns);
        const isTitle = isCoreTitleField(field);
        const type =
          field.source === "custom"
            ? CUSTOM_TYPE_SET.has(field.type)
              ? field.type
              : "text"
            : field.type;
        const showInList =
          typeof field.showInList === "boolean"
            ? field.showInList
            : defaultTaskShowInList({ source: field.source, coreKey: field.coreKey, type });
        const showInGrid =
          typeof field.showInGrid === "boolean"
            ? field.showInGrid
            : defaultTaskShowInGrid({ source: field.source, coreKey: field.coreKey, type });
        const filterable =
          supportsTaskFiltering(type) &&
          (typeof field.filterable === "boolean" ? field.filterable : true);
        const sortable =
          supportsTaskSorting(type) &&
          (typeof field.sortable === "boolean" ? field.sortable : true);
        return {
          ...field,
          pane,
          type,
          layoutRow: row,
          layoutColumns: columns,
          layoutColSpan: manualSpan,
          spanMode,
          enabled: isTitle ? true : field.enabled,
          required: isTitle ? true : field.required,
          showInList,
          showInGrid,
          filterable,
          sortable,
          options:
            type === "select" || type === "multiselect" ? field.options : [],
          multiple: type === "file" ? field.multiple : false,
          accept: type === "file" ? field.accept : "",
          metadataFields: type === "file" ? field.metadataFields : [],
          conditions: sanitizeTaskBuilderConditions(field.conditions, field.key, type),
        };
      })
      .sort((a, b) => {
        if (a.pane !== b.pane) return a.pane === "main" ? -1 : 1;
        if (a.layoutRow !== b.layoutRow) return a.layoutRow - b.layoutRow;
        return a.order - b.order;
      });
    const availableKeys = new Set(normalized.map((field) => field.key));
    return normalized.map((field, index) => ({
      ...field,
      order: index + 1,
      conditions: (field.conditions ?? []).filter(
        (condition) =>
          condition.sourceKey !== field.key && availableKeys.has(condition.sourceKey)
      ),
    }));
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/administration/task-form-config", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load task form config");
        const data = (await res.json()) as { fields?: TaskFormField[] };
        if (!mounted) return;
        const list = normalizeLayoutFields(Array.isArray(data.fields) ? data.fields : []);
        setFields(list);
        setSelectedId(list[0]?.id ?? null);
      } catch (error) {
        if (mounted) {
          toast.error(error instanceof Error ? error.message : "Failed to load task form config");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      setLeftPanelWidth((prev) => clampLeftPanelWidth(prev));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampLeftPanelWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const onPointerMove = (event: MouseEvent) => {
      const rect = layoutRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = event.clientX - rect.left;
      setLeftPanelWidth(clampLeftPanelWidth(next));
    };
    const stopResizing = () => setIsResizing(false);

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [clampLeftPanelWidth, isResizing]);

  const selectedField = useMemo(
    () => fields.find((field) => field.id === selectedId) ?? null,
    [fields, selectedId]
  );

  const paneRows = useMemo<PaneRows>(() => {
    const buildRows = (pane: TaskFormPane) => {
      const rowMap = new Map<
        number,
        { row: number; columns: TaskFormRowColumns; fields: TaskFormField[] }
      >();
      for (const field of fields.filter((entry) => entry.pane === pane)) {
        const row = normalizeRow(field.layoutRow, field.order);
        const columns = clampRowColumns(field.layoutColumns);
        const existing = rowMap.get(row);
        if (!existing) {
          rowMap.set(row, { row, columns, fields: [field] });
        } else {
          existing.fields.push(field);
        }
      }
      return Array.from(rowMap.values())
        .sort((a, b) => a.row - b.row)
        .map((row) => ({
          ...row,
          fields: row.fields.sort((a, b) => a.order - b.order),
        }));
    };
    return {
      main: buildRows("main"),
      side: buildRows("side"),
    };
  }, [fields]);
  const conditionSourceFields = useMemo(
    () =>
      selectedField
        ? fields
            .filter((field) => field.id !== selectedField.id && field.enabled)
            .map((field) => ({
              key: field.key,
              label: `${field.label} (${field.key})`,
            }))
        : [],
    [fields, selectedField]
  );

  function mutateField(id: string, updater: (field: TaskFormField) => TaskFormField) {
    setFields((prev) => normalizeLayoutFields(prev.map((field) => (field.id === id ? updater(field) : field))));
    setDirty(true);
  }

  function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    setFields((prev) => {
      const fromIndex = prev.findIndex((entry) => entry.id === fromId);
      const toIndex = prev.findIndex((entry) => entry.id === toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      const target = next[toIndex];
      const targetPane = target ? normalizePane(target.pane, "main") : normalizePane(item.pane, "main");
      const targetRow = target ? normalizeRow(target.layoutRow, target.order) : normalizeRow(item.layoutRow, item.order);
      const targetColumns = target ? clampRowColumns(target.layoutColumns) : clampRowColumns(item.layoutColumns);
      next.splice(toIndex, 0, {
        ...item,
        pane: targetPane,
        layoutRow: targetRow,
        layoutColumns: targetColumns,
        layoutColSpan:
          getTaskFieldSpanMode(item) === "manual"
            ? clampSpan(item.layoutColSpan, targetColumns)
            : item.layoutColSpan,
      });
      return normalizeLayoutFields(next);
    });
    setDirty(true);
  }

  function setRowColumns(pane: TaskFormPane, row: number, columns: TaskFormRowColumns) {
    setFields((prev) =>
      normalizeLayoutFields(
        prev.map((field) => {
          if (normalizePane(field.pane, "main") !== pane) return field;
          if (normalizeRow(field.layoutRow, field.order) !== row) return field;
          return {
            ...field,
            layoutColumns: columns,
            layoutColSpan:
              getTaskFieldSpanMode(field) === "manual"
                ? clampSpan(field.layoutColSpan, columns)
                : field.layoutColSpan,
          };
        })
      )
    );
    setDirty(true);
  }

  function moveFieldToRow(fieldId: string, pane: TaskFormPane, row: number) {
    setFields((prev) =>
      normalizeLayoutFields(
        prev.map((field) => {
          if (field.id !== fieldId) return field;
          const normalizedRow = normalizeRow(row, field.order);
          const rowColumns =
            paneRows[pane].find((entry) => entry.row === normalizedRow)?.columns ??
            clampRowColumns(field.layoutColumns);
          return {
            ...field,
            pane,
            layoutRow: normalizedRow,
            layoutColumns: rowColumns,
            layoutColSpan:
              getTaskFieldSpanMode(field) === "manual"
                ? clampSpan(field.layoutColSpan, rowColumns)
                : field.layoutColSpan,
          };
        })
      )
    );
    setDirty(true);
  }

  function addCustomField(targetPane: TaskFormPane = "main", targetRow?: number) {
    const id = `custom_${Date.now().toString(36)}`;
    const paneRowsForTarget = paneRows[targetPane];
    const row =
      targetRow ??
      (paneRowsForTarget.length > 0 ? paneRowsForTarget[paneRowsForTarget.length - 1].row + 1 : 1);
    const rowColumns = paneRowsForTarget.find((entry) => entry.row === row)?.columns ?? 1;
    const newField: TaskFormField = {
      id,
      key: normalizeKey(id, id),
      label: "New Field",
      type: "text",
      source: "custom",
      coreKey: null,
      enabled: true,
      required: false,
      order: nextFieldOrder(fields),
      placeholder: "",
      helpText: "",
      pane: targetPane,
      layoutRow: row,
      layoutColumns: rowColumns,
      layoutColSpan: 1,
      spanMode: "auto",
      showInList: defaultTaskShowInList({ source: "custom", coreKey: null, type: "text" }),
      showInGrid: defaultTaskShowInGrid({ source: "custom", coreKey: null, type: "text" }),
      filterable: supportsTaskFiltering("text"),
      sortable: supportsTaskSorting("text"),
      options: [],
      multiple: false,
      accept: "",
      metadataFields: [],
      conditions: [],
    };
    setFields((prev) => normalizeLayoutFields([...prev, newField]));
    setSelectedId(id);
    setDirty(true);
  }

  function moveFieldToRowEnd(fieldId: string, pane: TaskFormPane, row: number) {
    setFields((prev) => {
      const fromIndex = prev.findIndex((entry) => entry.id === fieldId);
      if (fromIndex < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      const rowFields = next.filter(
        (entry) =>
          normalizePane(entry.pane, "main") === pane &&
          normalizeRow(entry.layoutRow, entry.order) === row
      );
      const rowColumns =
        rowFields.length > 0
          ? clampRowColumns(rowFields[0].layoutColumns)
          : (
              paneRows[pane].find((entry) => entry.row === row)?.columns ??
              clampRowColumns(item.layoutColumns)
            );
      next.push({
        ...item,
        pane,
        layoutRow: row,
        layoutColumns: rowColumns,
        layoutColSpan:
          getTaskFieldSpanMode(item) === "manual"
            ? clampSpan(item.layoutColSpan, rowColumns)
            : item.layoutColSpan,
      });
      return normalizeLayoutFields(next);
    });
    setDirty(true);
  }

  async function removeField(id: string) {
    const item = fields.find((entry) => entry.id === id);
    if (!item || item.source === "core" || !canManage) return;

    setDeletingFieldId(id);
    try {
      const prompt = `Remove "${item.label}" from task form? Existing saved values will stay preserved in records.`;
      if (!window.confirm(prompt)) return;

      setFields((prev) => {
        const next = normalizeLayoutFields(prev.filter((entry) => entry.id !== id));
        if (selectedId === id) {
          setSelectedId(next[0]?.id ?? null);
        }
        return next;
      });
      setDirty(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove field");
    } finally {
      setDeletingFieldId(null);
    }
  }

  function addCondition(targetId: string) {
    setFields((prev) => {
      const sourceKey = prev.find((field) => field.id !== targetId)?.key ?? "";
      const next = prev.map((field) => {
        if (field.id !== targetId) return field;
        const conditionId = `condition_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        return {
          ...field,
          conditions: [
            ...(field.conditions ?? []),
            {
              id: conditionId,
              sourceKey,
              operator: "equals",
              value: "",
              action: "show",
              options: [],
              enabled: true,
            } as TaskFormFieldCondition,
          ],
        };
      });
      return normalizeLayoutFields(next);
    });
    setDirty(true);
  }

  function mutateCondition(
    targetId: string,
    conditionId: string,
    updater: (condition: TaskFormFieldCondition) => TaskFormFieldCondition
  ) {
    mutateField(targetId, (field) => ({
      ...field,
      conditions: (field.conditions ?? []).map((condition) =>
        condition.id === conditionId ? updater(condition) : condition
      ),
    }));
  }

  function removeCondition(targetId: string, conditionId: string) {
    mutateField(targetId, (field) => ({
      ...field,
      conditions: (field.conditions ?? []).filter((condition) => condition.id !== conditionId),
    }));
  }

  function addMetaField(targetId: string) {
    mutateField(targetId, (field) => {
      const metaId = `meta_${Date.now().toString(36)}`;
      return {
        ...field,
        metadataFields: [
          ...field.metadataFields,
          {
            id: metaId,
            key: normalizeKey(metaId, metaId),
            label: "Metadata Field",
            type: "text",
            required: false,
            placeholder: "",
            options: [],
          },
        ],
      };
    });
  }

  function mutateMetaField(
    targetId: string,
    metaId: string,
    updater: (field: TaskFileMetadataField) => TaskFileMetadataField
  ) {
    mutateField(targetId, (field) => ({
      ...field,
      metadataFields: field.metadataFields.map((meta) => (meta.id === metaId ? updater(meta) : meta)),
    }));
  }

  function removeMetaField(targetId: string, metaId: string) {
    mutateField(targetId, (field) => ({
      ...field,
      metadataFields: field.metadataFields.filter((meta) => meta.id !== metaId),
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/administration/task-form-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; fields?: TaskFormField[] } | null;
      if (!res.ok) throw new Error(data?.error ?? "Failed to save task form");
      const updated = normalizeLayoutFields(Array.isArray(data?.fields) ? data.fields : fields);
      setFields(updated);
      setDirty(false);
      toast.success("Task form settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save task form");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Task Form Builder</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">Loading form builder...</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Task Form Builder</CardTitle>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => addCustomField()} disabled={!canManage || saving}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Field
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-[#AA8038] text-white hover:bg-[#8f682d]"
            onClick={() => void save()}
            disabled={!canManage || saving || !dirty}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={layoutRef}
          className="grid gap-4 lg:gap-0 lg:[grid-template-columns:minmax(340px,var(--builder-left))_12px_minmax(520px,1fr)]"
          style={
            {
              "--builder-left": `${leftPanelWidth}px`,
            } as CSSProperties
          }
        >
        <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
          <p className="text-xs text-slate-500">
            Drag fields between Main Form and Side Panel, then adjust row/column layout.
          </p>
          {(["main", "side"] as const).map((pane) => {
            const rows = paneRows[pane];
            const paneTitle = pane === "main" ? "Main Form" : "Side Panel";
            const paneSubtitle =
              pane === "main"
                ? "Subject, details, and custom fields"
                : "Assignees, privacy, and side controls";
            return (
              <div key={pane} className="space-y-2 rounded-md border bg-white p-2">
                <div className="flex items-start justify-between gap-2 px-1">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{paneTitle}</p>
                    <p className="text-[11px] text-slate-500">{paneSubtitle}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => addCustomField(pane)}
                    disabled={!canManage || saving}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Field
                  </Button>
                </div>
                {rows.length === 0 ? (
                  <div className="rounded border border-dashed px-3 py-4 text-xs text-slate-500">
                    No fields in this pane.
                  </div>
                ) : (
                  <div className="max-h-[34vh] space-y-3 overflow-auto pr-1">
                    {rows.map((row) => (
                      <div
                        key={`${pane}-row-${row.row}`}
                        className="rounded-md border bg-slate-50 p-2"
                        onDragOver={(event) => {
                          if (!canManage) return;
                          event.preventDefault();
                        }}
                        onDrop={() => {
                          if (!canManage || !draggingId) return;
                          moveFieldToRowEnd(draggingId, pane, row.row);
                          setDraggingId(null);
                        }}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Row {row.row}</p>
                          <div className="flex items-center gap-2">
                            <Select
                              value={String(row.columns)}
                              onValueChange={(value) => setRowColumns(pane, row.row, clampRowColumns(value))}
                              disabled={!canManage}
                            >
                              <SelectTrigger className="h-8 w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 Column</SelectItem>
                                <SelectItem value="2">2 Columns</SelectItem>
                                <SelectItem value="3">3 Columns</SelectItem>
                                <SelectItem value="4">4 Columns</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => addCustomField(pane, row.row)}
                              disabled={!canManage || saving}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Add
                            </Button>
                          </div>
                        </div>
                        <div
                          className="grid gap-2"
                          style={{ gridTemplateColumns: `repeat(${row.columns}, minmax(0, 1fr))` }}
                        >
                          {row.fields.map((field) => {
                            const span = getEffectiveTaskFieldSpan(field, row.columns);
                            return (
                              <div
                                key={field.id}
                                draggable={canManage}
                                onDragStart={() => setDraggingId(field.id)}
                                onDragEnd={() => setDraggingId(null)}
                                onDragOver={(event) => {
                                  if (!canManage) return;
                                  event.preventDefault();
                                }}
                                onDrop={() => {
                                  if (!canManage || !draggingId) return;
                                  reorder(draggingId, field.id);
                                  setDraggingId(null);
                                }}
                                onClick={() => setSelectedId(field.id)}
                                className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2 text-sm ${
                                  selectedId === field.id
                                    ? "border-[#AA8038] bg-[#fff9ee]"
                                    : "border-slate-200 bg-white hover:border-[#AA8038]/40"
                                }`}
                                style={{ gridColumn: `span ${span} / span ${span}` }}
                              >
                                <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium text-slate-700">{field.label}</p>
                                  <p className="text-[11px] text-slate-500">
                                    {field.source === "core" ? "Core" : "Custom"} | {field.type} | {getTaskFieldSpanMode(field)} | span {span}
                                  </p>
                                </div>
                                {!field.enabled ? (
                                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">Off</span>
                                ) : null}
                                {field.required ? (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">Req</span>
                                ) : null}
                                {field.source === "custom" ? (
                                  <button
                                    type="button"
                                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void removeField(field.id);
                                    }}
                                    disabled={!canManage || deletingFieldId === field.id}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {selectedField ? (
          <>
            <div
              className="hidden lg:flex lg:items-stretch lg:justify-center"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize form builder panels"
            >
              <button
                type="button"
                className={`group h-full w-2 cursor-col-resize rounded bg-slate-200/70 transition hover:bg-[#AA8038]/40 ${
                  isResizing ? "bg-[#AA8038]/50" : ""
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setIsResizing(true);
                }}
                onDoubleClick={() => setLeftPanelWidth(DEFAULT_LEFT_PANEL_WIDTH)}
                aria-label="Drag to resize. Double click to reset."
              >
                <span className="sr-only">Resize panels</span>
              </button>
            </div>
            <div className="space-y-4 rounded-lg border p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Label</Label>
                <Input
                  value={selectedField.label}
                  onChange={(event) =>
                    mutateField(selectedField.id, (field) => ({ ...field, label: event.target.value }))
                  }
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Field Key</Label>
                <Input
                  value={selectedField.key}
                  onChange={(event) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      key: normalizeKey(event.target.value, field.key),
                    }))
                  }
                  disabled={!canManage || selectedField.source === "core"}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Pane</Label>
                <Select
                  value={selectedField.pane}
                  onValueChange={(value) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      pane: value === "side" ? "side" : "main",
                    }))
                  }
                  disabled={!canManage}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">Main Form</SelectItem>
                    <SelectItem value="side">Side Panel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Row</Label>
                <Input
                  type="number"
                  min={1}
                  value={normalizeRow(selectedField.layoutRow, selectedField.order)}
                  onChange={(event) => {
                    const nextRow = normalizeRow(event.target.value, selectedField.order);
                    moveFieldToRow(selectedField.id, selectedField.pane, nextRow);
                  }}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Columns In Row</Label>
                <Select
                  value={String(clampRowColumns(selectedField.layoutColumns))}
                  onValueChange={(value) =>
                    setRowColumns(
                      selectedField.pane,
                      normalizeRow(selectedField.layoutRow, selectedField.order),
                      clampRowColumns(value)
                    )
                  }
                  disabled={!canManage}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Column</SelectItem>
                    <SelectItem value="2">2 Columns</SelectItem>
                    <SelectItem value="3">3 Columns</SelectItem>
                    <SelectItem value="4">4 Columns</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Span Mode</Label>
                <Select
                  value={getTaskFieldSpanMode(selectedField)}
                  onValueChange={(value) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      spanMode: value === "manual" ? "manual" : "auto",
                      layoutColSpan:
                        value === "manual"
                          ? clampSpan(field.layoutColSpan, clampRowColumns(field.layoutColumns))
                          : field.layoutColSpan,
                    }))
                  }
                  disabled={!canManage}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label>{getTaskFieldSpanMode(selectedField) === "manual" ? "Field Span" : "Auto Span"}</Label>
                {getTaskFieldSpanMode(selectedField) === "manual" ? (
                  <Select
                    value={String(
                      clampSpan(selectedField.layoutColSpan, clampRowColumns(selectedField.layoutColumns))
                    )}
                    onValueChange={(value) =>
                      mutateField(selectedField.id, (field) => {
                        const rowColumns = clampRowColumns(field.layoutColumns);
                        return {
                          ...field,
                          spanMode: "manual",
                          layoutColSpan: clampSpan(value, rowColumns),
                        };
                      })
                    }
                    disabled={!canManage}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        { length: clampRowColumns(selectedField.layoutColumns) },
                        (_, index) => index + 1
                      ).map((span) => (
                        <SelectItem key={`span-${span}`} value={String(span)}>
                          Span {span}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={String(
                      getAutoTaskFieldSpan(
                        selectedField,
                        clampRowColumns(selectedField.layoutColumns)
                      )
                    )}
                    disabled
                  />
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                {selectedField.source === "custom" ? (
                  <Select
                    value={selectedField.type}
                    onValueChange={(value) =>
                      mutateField(selectedField.id, (field) => ({
                        ...field,
                        type: value as TaskFormFieldType,
                        options:
                          value === "select" || value === "multiselect" ? field.options : [],
                        metadataFields: value === "file" ? field.metadataFields : [],
                        conditions:
                          value === "select" || value === "multiselect"
                            ? field.conditions ?? []
                            : (field.conditions ?? []).filter(
                                (condition) => condition.action !== "options"
                              ),
                      }))
                    }
                    disabled={!canManage}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={selectedField.type} disabled />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Placeholder</Label>
                <Input
                  value={selectedField.placeholder}
                  onChange={(event) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      placeholder: event.target.value,
                    }))
                  }
                  disabled={!canManage}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 rounded border px-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedField.enabled}
                  onChange={(event) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      enabled: isCoreTitleField(field) ? true : event.target.checked,
                      required:
                        isCoreTitleField(field)
                          ? true
                          : event.target.checked
                            ? field.required
                            : false,
                    }))
                  }
                  disabled={!canManage || isCoreTitleField(selectedField)}
                />
                Enabled
              </label>
              <label className="flex items-center gap-2 rounded border px-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedField.required}
                  onChange={(event) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      required: isCoreTitleField(field) ? true : event.target.checked,
                      enabled:
                        isCoreTitleField(field)
                          ? true
                          : event.target.checked
                            ? true
                            : field.enabled,
                    }))
                  }
                  disabled={!canManage || isCoreTitleField(selectedField)}
                />
                Required
              </label>
              {selectedField.type === "file" ? (
                <label className="flex items-center gap-2 rounded border px-2 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedField.multiple}
                    onChange={(event) =>
                      mutateField(selectedField.id, (field) => ({
                        ...field,
                        multiple: event.target.checked,
                      }))
                    }
                    disabled={!canManage}
                  />
                  Multi Upload
                </label>
              ) : (
                <div />
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex items-center gap-2 rounded border px-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={
                    typeof selectedField.showInList === "boolean"
                      ? selectedField.showInList
                      : defaultTaskShowInList(selectedField)
                  }
                  onChange={(event) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      showInList: event.target.checked,
                    }))
                  }
                  disabled={!canManage || selectedField.type === "actions"}
                />
                Show In List
              </label>
              <label className="flex items-center gap-2 rounded border px-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={
                    typeof selectedField.showInGrid === "boolean"
                      ? selectedField.showInGrid
                      : defaultTaskShowInGrid(selectedField)
                  }
                  onChange={(event) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      showInGrid: event.target.checked,
                    }))
                  }
                  disabled={!canManage || selectedField.type === "actions"}
                />
                Show In Grid
              </label>
              <label className="flex items-center gap-2 rounded border px-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={
                    typeof selectedField.filterable === "boolean"
                      ? selectedField.filterable
                      : supportsTaskFiltering(selectedField.type)
                  }
                  onChange={(event) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      filterable: event.target.checked,
                    }))
                  }
                  disabled={!canManage || !supportsTaskFiltering(selectedField.type)}
                />
                Filterable
              </label>
              <label className="flex items-center gap-2 rounded border px-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={
                    typeof selectedField.sortable === "boolean"
                      ? selectedField.sortable
                      : supportsTaskSorting(selectedField.type)
                  }
                  onChange={(event) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      sortable: event.target.checked,
                    }))
                  }
                  disabled={!canManage || !supportsTaskSorting(selectedField.type)}
                />
                Sortable
              </label>
            </div>

            <div className="space-y-1.5">
              <Label>Help Text</Label>
              <Input
                value={selectedField.helpText}
                onChange={(event) =>
                  mutateField(selectedField.id, (field) => ({ ...field, helpText: event.target.value }))
                }
                disabled={!canManage}
              />
            </div>

            {(selectedField.type === "select" || selectedField.type === "multiselect") && (
              <div className="space-y-1.5">
                <Label>Options (one per line)</Label>
                <textarea
                  className="min-h-28 w-full rounded-md border px-2 py-2 text-sm"
                  value={selectedField.options.join("\n")}
                  onChange={(event) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      options: asOptionLines(event.target.value),
                    }))
                  }
                  disabled={!canManage}
                />
              </div>
            )}

            <div className="space-y-2 rounded-lg border bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">Conditional Logic</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addCondition(selectedField.id)}
                  disabled={!canManage || conditionSourceFields.length === 0}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Rule
                </Button>
              </div>
              {conditionSourceFields.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Add at least one more enabled field to use as a condition source.
                </p>
              ) : null}
              {(selectedField.conditions ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">No conditional rules configured.</p>
              ) : (
                <div className="space-y-2">
                  {(selectedField.conditions ?? []).map((condition) => (
                    <div key={condition.id} className="space-y-2 rounded border bg-white p-2">
                      <div className="grid gap-2 md:grid-cols-4">
                        <Select
                          value={condition.action}
                          onValueChange={(value) =>
                            mutateCondition(selectedField.id, condition.id, (entry) => ({
                              ...entry,
                              action: value as TaskFormFieldCondition["action"],
                              options:
                                value === "options"
                                  ? entry.options
                                  : [],
                            }))
                          }
                          disabled={!canManage}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITION_ACTION_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                                disabled={
                                  option.value === "options" &&
                                  !supportsConditionalOptions(selectedField.type)
                                }
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={condition.sourceKey || "__none"}
                          onValueChange={(value) =>
                            mutateCondition(selectedField.id, condition.id, (entry) => ({
                              ...entry,
                              sourceKey: value && value !== "__none" ? value : "",
                            }))
                          }
                          disabled={!canManage}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Source field" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Select source field</SelectItem>
                            {conditionSourceFields.map((option) => (
                              <SelectItem key={option.key} value={option.key}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={condition.operator}
                          onValueChange={(value) =>
                            mutateCondition(selectedField.id, condition.id, (entry) => ({
                              ...entry,
                              operator: value as TaskFormFieldCondition["operator"],
                            }))
                          }
                          disabled={!canManage}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITION_OPERATOR_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center justify-between gap-2 rounded border px-2 py-1.5">
                          <label className="flex items-center gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={condition.enabled !== false}
                              onChange={(event) =>
                                mutateCondition(selectedField.id, condition.id, (entry) => ({
                                  ...entry,
                                  enabled: event.target.checked,
                                }))
                              }
                              disabled={!canManage}
                            />
                            Enabled
                          </label>
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            onClick={() => removeCondition(selectedField.id, condition.id)}
                            disabled={!canManage}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {condition.operator === "is_empty" || condition.operator === "is_not_empty" ? null : (
                        <Input
                          value={condition.value}
                          onChange={(event) =>
                            mutateCondition(selectedField.id, condition.id, (entry) => ({
                              ...entry,
                              value: event.target.value,
                            }))
                          }
                          placeholder="Compare value"
                          disabled={!canManage}
                        />
                      )}
                      {condition.action === "options" ? (
                        <textarea
                          className="min-h-20 w-full rounded border px-2 py-2 text-xs"
                          value={condition.options.join("\n")}
                          onChange={(event) =>
                            mutateCondition(selectedField.id, condition.id, (entry) => ({
                              ...entry,
                              options: asOptionLines(event.target.value),
                            }))
                          }
                          placeholder="Dropdown options for this condition (one per line)"
                          disabled={!canManage}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedField.type === "file" && (
              <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
                <div className="space-y-1.5">
                  <Label>Accepted file types (optional)</Label>
                  <Input
                    value={selectedField.accept}
                    onChange={(event) =>
                      mutateField(selectedField.id, (field) => ({ ...field, accept: event.target.value }))
                    }
                    placeholder="e.g. .pdf,.docx,image/*"
                    disabled={!canManage}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">File Metadata Fields</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addMetaField(selectedField.id)}
                    disabled={!canManage}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add Metadata Field
                  </Button>
                </div>

                <div className="space-y-2">
                  {selectedField.metadataFields.length === 0 ? (
                    <p className="text-xs text-slate-500">No metadata fields configured.</p>
                  ) : (
                    selectedField.metadataFields.map((meta) => (
                      <div key={meta.id} className="space-y-2 rounded border bg-white p-2">
                        <div className="grid gap-2 sm:grid-cols-3">
                          <Input
                            value={meta.label}
                            onChange={(event) =>
                              mutateMetaField(selectedField.id, meta.id, (entry) => ({
                                ...entry,
                                label: event.target.value,
                              }))
                            }
                            placeholder="Label"
                            disabled={!canManage}
                          />
                          <Input
                            value={meta.key}
                            onChange={(event) =>
                              mutateMetaField(selectedField.id, meta.id, (entry) => ({
                                ...entry,
                                key: normalizeKey(event.target.value, entry.key),
                              }))
                            }
                            placeholder="Key"
                            disabled={!canManage}
                          />
                          <Select
                            value={meta.type}
                            onValueChange={(value) =>
                              mutateMetaField(selectedField.id, meta.id, (entry) => ({
                                ...entry,
                                type: value as TaskFileMetadataField["type"],
                                options: value === "select" ? entry.options : [],
                              }))
                            }
                            disabled={!canManage}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {META_TYPE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              checked={meta.required}
                              onChange={(event) =>
                                mutateMetaField(selectedField.id, meta.id, (entry) => ({
                                  ...entry,
                                  required: event.target.checked,
                                }))
                              }
                              disabled={!canManage}
                            />
                            Required
                          </label>
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            onClick={() => removeMetaField(selectedField.id, meta.id)}
                            disabled={!canManage}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {meta.type === "select" ? (
                          <textarea
                            className="min-h-20 w-full rounded border px-2 py-2 text-xs"
                            value={meta.options.join("\n")}
                            onChange={(event) =>
                              mutateMetaField(selectedField.id, meta.id, (entry) => ({
                                ...entry,
                                options: asOptionLines(event.target.value),
                              }))
                            }
                            placeholder="Options (one per line)"
                            disabled={!canManage}
                          />
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            </div>
          </>
        ) : (
          <>
            <div
              className="hidden lg:flex lg:items-stretch lg:justify-center"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize form builder panels"
            >
              <button
                type="button"
                className={`group h-full w-2 cursor-col-resize rounded bg-slate-200/70 transition hover:bg-[#AA8038]/40 ${
                  isResizing ? "bg-[#AA8038]/50" : ""
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setIsResizing(true);
                }}
                onDoubleClick={() => setLeftPanelWidth(DEFAULT_LEFT_PANEL_WIDTH)}
                aria-label="Drag to resize. Double click to reset."
              >
                <span className="sr-only">Resize panels</span>
              </button>
            </div>
            <div className="rounded-lg border p-4 text-sm text-slate-500">
              Select a field from the left panel to edit configuration.
            </div>
          </>
        )}
        </div>
      </CardContent>
    </Card>
  );
}


