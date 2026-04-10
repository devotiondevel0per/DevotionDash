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
import { GripVertical, Plus, Save, Trash2 } from "lucide-react";
import type {
  ProjectFileMetadataField,
  ProjectFormField,
  ProjectFormFieldType,
} from "@/lib/project-form-config";

type Props = {
  canManage: boolean;
};

const FIELD_TYPE_OPTIONS: Array<{ value: ProjectFormFieldType; label: string }> = [
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

const META_TYPE_OPTIONS: Array<{ value: ProjectFileMetadataField["type"]; label: string }> = [
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

function normalizeKey(value: string, fallback: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || fallback
  );
}

function nextFieldOrder(fields: ProjectFormField[]) {
  return fields.length > 0 ? Math.max(...fields.map((f) => f.order)) + 1 : 1;
}

function asOptionLines(lines: string) {
  return lines
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function ProjectFormBuilder({ canManage }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);
  const [fields, setFields] = useState<ProjectFormField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/administration/project-form-config", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load project form config");
        const data = (await res.json()) as { fields?: ProjectFormField[] };
        if (!mounted) return;
        const list = Array.isArray(data.fields) ? data.fields : [];
        setFields(list);
        setSelectedId(list[0]?.id ?? null);
      } catch (error) {
        if (mounted) {
          toast.error(error instanceof Error ? error.message : "Failed to load project form config");
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

  function mutateField(id: string, updater: (field: ProjectFormField) => ProjectFormField) {
    setFields((prev) =>
      prev.map((field) => (field.id === id ? updater(field) : field)).map((field, index) => ({ ...field, order: index + 1 }))
    );
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
      next.splice(toIndex, 0, item);
      return next.map((field, index) => ({ ...field, order: index + 1 }));
    });
    setDirty(true);
  }

  function addCustomField() {
    const id = `custom_${Date.now().toString(36)}`;
    const newField: ProjectFormField = {
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
      options: [],
      multiple: false,
      accept: "",
      metadataFields: [],
    };
    setFields((prev) => [...prev, newField]);
    setSelectedId(id);
    setDirty(true);
  }

  async function lookupFieldImpactCount(fieldKey: string): Promise<number> {
    if (!fieldKey) return 0;
    const res = await fetch(
      `/api/administration/project-form-config/impact?fieldKey=${encodeURIComponent(fieldKey)}`,
      { cache: "no-store" }
    );
    const data = (await res.json().catch(() => null)) as { count?: unknown; error?: string } | null;
    if (!res.ok) throw new Error(data?.error ?? "Failed to check field usage");
    return typeof data?.count === "number" ? Math.max(0, Math.floor(data.count)) : 0;
  }

  async function removeField(id: string) {
    const item = fields.find((entry) => entry.id === id);
    if (!item || item.source === "core" || !canManage) return;

    setDeletingFieldId(id);
    try {
      const impactCount = await lookupFieldImpactCount(item.key);
      const hasDataMsg =
        impactCount > 0
          ? `"${item.label}" has saved data in ${impactCount} project${impactCount === 1 ? "" : "s"}. Removing this field will hide it from the form, but existing saved values will be preserved. Continue?`
          : `Remove "${item.label}" from this form? Existing saved values (if any) will remain preserved.`;

      if (!window.confirm(hasDataMsg)) return;

      setFields((prev) => {
        const next = prev
          .filter((entry) => entry.id !== id)
          .map((entry, index) => ({ ...entry, order: index + 1 }));
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
    updater: (field: ProjectFileMetadataField) => ProjectFileMetadataField
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
      const res = await fetch("/api/administration/project-form-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; fields?: ProjectFormField[] } | null;
      if (!res.ok) throw new Error(data?.error ?? "Failed to save project form");
      const updated = Array.isArray(data?.fields) ? data.fields : fields;
      setFields(updated);
      setDirty(false);
      toast.success("Project form settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save project form");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Project Form Builder</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">Loading form builder…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Project Form Builder</CardTitle>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addCustomField} disabled={!canManage || saving}>
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
      <CardContent className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2 rounded-lg border bg-slate-50 p-2">
          {fields.map((field) => (
            <div
              key={field.id}
              draggable={canManage}
              onDragStart={() => setDraggingId(field.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!draggingId) return;
                reorder(draggingId, field.id);
                setDraggingId(null);
              }}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2 text-sm ${
                selectedId === field.id
                  ? "border-[#AA8038] bg-white"
                  : "border-transparent bg-white/70 hover:border-slate-200"
              }`}
              onClick={() => setSelectedId(field.id)}
            >
              <GripVertical className="h-4 w-4 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-700">{field.label}</p>
                <p className="text-[11px] text-slate-500">
                  {field.source === "core" ? "Core" : "Custom"} • {field.type}
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
          ))}
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={selectedField.type}
                  onValueChange={(value) =>
                    mutateField(selectedField.id, (field) => ({
                      ...field,
                      type: value as ProjectFormFieldType,
                      options:
                        value === "select" || value === "multiselect" ? field.options : [],
                      metadataFields: value === "file" ? field.metadataFields : [],
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
                      enabled: event.target.checked,
                      required: event.target.checked ? field.required : false,
                    }))
                  }
                  disabled={!canManage}
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
                      required: event.target.checked,
                      enabled: event.target.checked ? true : field.enabled,
                    }))
                  }
                  disabled={!canManage}
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
                                type: value as ProjectFileMetadataField["type"],
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
        ) : (
          <div className="rounded-lg border p-4 text-sm text-slate-500">
            Select a field from the left panel to edit configuration.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
