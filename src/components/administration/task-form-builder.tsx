"use client";

import { useEffect, useMemo, useState } from "react";
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
import { GripVertical, Save } from "lucide-react";
import type { TaskFormField, TaskFormPane, TaskFormRowColumns } from "@/lib/task-form-config";

type Props = {
  canManage: boolean;
};

type TaskPaneRows = Record<TaskFormPane, Array<{ row: number; columns: TaskFormRowColumns; fields: TaskFormField[] }>>;

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
  return value === "side" ? "side" : fallback;
}

export function TaskFormBuilder({ canManage }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [fields, setFields] = useState<TaskFormField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function normalizeLayoutFields(nextFields: TaskFormField[]) {
    return nextFields
      .map((field, index) => {
        const row = normalizeRow(field.layoutRow, field.order || index + 1);
        const columns = clampRowColumns(field.layoutColumns);
        const span = clampSpan(field.layoutColSpan, columns);
        const pane = normalizePane(field.pane, "main");
        return {
          ...field,
          pane,
          layoutRow: row,
          layoutColumns: columns,
          layoutColSpan: span,
          required: field.coreKey === "title" ? true : field.required,
          enabled: field.coreKey === "title" ? true : field.enabled,
        };
      })
      .sort((a, b) => {
        if (a.pane !== b.pane) return a.pane === "main" ? -1 : 1;
        if (a.layoutRow !== b.layoutRow) return a.layoutRow - b.layoutRow;
        return a.order - b.order;
      })
      .map((field, index) => ({ ...field, order: index + 1 }));
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

  const selectedField = useMemo(
    () => fields.find((field) => field.id === selectedId) ?? null,
    [fields, selectedId]
  );

  const paneRows = useMemo<TaskPaneRows>(() => {
    const buildPaneRows = (pane: TaskFormPane) => {
      const rowMap = new Map<number, { row: number; columns: TaskFormRowColumns; fields: TaskFormField[] }>();
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
      main: buildPaneRows("main"),
      side: buildPaneRows("side"),
    };
  }, [fields]);

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
        layoutColSpan: clampSpan(item.layoutColSpan, targetColumns),
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
            layoutColSpan: clampSpan(field.layoutColSpan, columns),
          };
        })
      )
    );
    setDirty(true);
  }

  function moveFieldToPaneRowEnd(fieldId: string, pane: TaskFormPane, row: number) {
    setFields((prev) => {
      const fromIndex = prev.findIndex((entry) => entry.id === fieldId);
      if (fromIndex < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      const rowFields = next.filter(
        (entry) => normalizePane(entry.pane, "main") === pane && normalizeRow(entry.layoutRow, entry.order) === row
      );
      const rowColumns =
        rowFields.length > 0
          ? clampRowColumns(rowFields[0].layoutColumns)
          : clampRowColumns(item.layoutColumns);
      next.push({
        ...item,
        pane,
        layoutRow: row,
        layoutColumns: rowColumns,
        layoutColSpan: clampSpan(item.layoutColSpan, rowColumns),
      });
      return normalizeLayoutFields(next);
    });
    setDirty(true);
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

  function renderPaneCanvas(pane: TaskFormPane, title: string, subtitle: string) {
    const rows = paneRows[pane];
    return (
      <div className="space-y-2 rounded-md border bg-white p-2">
        <div className="px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</p>
          <p className="text-[11px] text-slate-500">{subtitle}</p>
        </div>
        {rows.length === 0 ? (
          <div className="rounded border border-dashed px-3 py-4 text-xs text-slate-500">
            No fields in this pane.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={`${pane}-row-${row.row}`}
              className="rounded border bg-slate-50 p-2"
              onDragOver={(event) => {
                if (!canManage) return;
                event.preventDefault();
              }}
              onDrop={() => {
                if (!canManage || !draggingId) return;
                moveFieldToPaneRowEnd(draggingId, pane, row.row);
                setDraggingId(null);
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-600">Row {row.row}</p>
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
              </div>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${row.columns}, minmax(0, 1fr))` }}
              >
                {row.fields.map((field) => {
                  const span = clampSpan(field.layoutColSpan, row.columns);
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
                        <p className="text-[11px] text-slate-500">{field.coreKey} | span {span}</p>
                      </div>
                      {!field.enabled ? (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">Off</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    );
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
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[460px_1fr]">
        <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
          <p className="text-xs text-slate-500">
            Drag fields between Main Form and Side Panel, then adjust rows/columns.
          </p>
          {renderPaneCanvas("main", "Main Form", "Primary task fields and editor blocks")}
          {renderPaneCanvas("side", "Side Panel", "Assignees and visibility controls")}
        </div>

        {selectedField ? (
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
                <Input value={selectedField.key} disabled />
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
                  onChange={(event) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      layoutRow: normalizeRow(event.target.value, field.order),
                    }))
                  }
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Input value={selectedField.type} disabled />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Columns In Row</Label>
                <Select
                  value={String(clampRowColumns(selectedField.layoutColumns))}
                  onValueChange={(value) =>
                    mutateField(selectedField.id, (field) => {
                      const rowColumns = clampRowColumns(value);
                      return {
                        ...field,
                        layoutColumns: rowColumns,
                        layoutColSpan: clampSpan(field.layoutColSpan, rowColumns),
                      };
                    })
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
                <Label>Field Span</Label>
                <Select
                  value={String(clampSpan(selectedField.layoutColSpan, clampRowColumns(selectedField.layoutColumns)))}
                  onValueChange={(value) =>
                    mutateField(selectedField.id, (field) => {
                      const rowColumns = clampRowColumns(field.layoutColumns);
                      return {
                        ...field,
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
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded border px-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedField.enabled}
                  onChange={(event) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      enabled: field.coreKey === "title" ? true : event.target.checked,
                      required:
                        field.coreKey === "title"
                          ? true
                          : event.target.checked
                            ? field.required
                            : false,
                    }))
                  }
                  disabled={!canManage || selectedField.coreKey === "title"}
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
                      required: field.coreKey === "title" ? true : event.target.checked,
                      enabled: field.coreKey === "title" ? true : (event.target.checked ? true : field.enabled),
                    }))
                  }
                  disabled={!canManage || selectedField.coreKey === "title"}
                />
                Required
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
          </div>
        ) : (
          <div className="rounded-lg border p-4 text-sm text-slate-500">
            Select a field from the canvas to edit configuration.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

