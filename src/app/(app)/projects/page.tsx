"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RichTextEditor,
  hasRichTextContent,
  normalizeRichText,
  richTextToPlainText,
} from "@/components/editor/rich-text-editor";
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
} from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Plus,
  Search,
  FolderOpen,
  FolderKanban,
  Archive,
  CheckCircle2,
  CheckSquare,
  Calendar,
  CalendarDays,
  Loader2,
  MessageSquare,
  Send,
  Users,
  ArrowLeft,
  Pencil,
  List,
  Columns3,
  LayoutGrid,
  Layers,
  Trash2,
  UserPlus,
  X,
  Reply,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildThreadTree, type ThreadNode } from "@/lib/task-comment-thread";
import type { ProjectFormField } from "@/lib/project-form-config";

// ─── Types ───────────────────────────────────────────────────────────────────

type ProjectCategory = {
  id: string;
  name: string;
};

type ProjectMember = {
  id: string;
  role: string;
  user: { id: string; name: string; fullname: string; photoUrl: string | null };
};

type Project = {
  id: string;
  name: string;
  description: string | null;
  customData?: Record<string, unknown> | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  category: ProjectCategory | null;
  members: ProjectMember[];
  tasks?: Array<{ status: string }>;
  _count: { phases: number; tasks: number };
};

type WorkflowStage = {
  key: string;
  label: string;
  color: string;
  isClosed: boolean;
  isDefault: boolean;
  order: number;
};

type ProjectTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  allowAssigneeComments?: boolean;
  canComment?: boolean;
  canEditTask?: boolean;
  canChangeStatus?: boolean;
  canDelete?: boolean;
  conversationAuthorEditDeleteWindowMinutes?: number;
  assignee: { id: string; name: string; fullname: string; photoUrl: string | null } | null;
  phase: { id: string; name: string } | null;
};

type ProjectTaskComment = {
  id: string;
  projectTaskId?: string;
  userId?: string;
  parentCommentId: string | null;
  content: string;
  createdAt: string;
  updatedAt?: string;
  user: { id: string; name: string; fullname: string };
};

type ProjectPhaseItem = {
  id: string;
  name: string;
  order: number;
  startDate: string | null;
  endDate: string | null;
};

type ProjectDetail = Project & {
  phases: ProjectPhaseItem[];
  tasks: ProjectTask[];
  taskStages?: WorkflowStage[];
};

type TeamUser = {
  id: string;
  name: string;
  fullname: string;
  photoUrl: string | null;
};

// ─── Config ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-700" },
  completed: { label: "Completed", className: "bg-primary/10 text-primary" },
  archived: { label: "Archived", className: "bg-gray-100 text-gray-500" },
};

const DEFAULT_PROJECT_TASK_STAGES: WorkflowStage[] = [
  { key: "todo", label: "To Do", color: "#64748b", isClosed: false, isDefault: true, order: 0 },
  { key: "in_progress", label: "In Progress", color: "#3b82f6", isClosed: false, isDefault: false, order: 1 },
  { key: "done", label: "Done", color: "#22c55e", isClosed: true, isDefault: false, order: 2 },
  { key: "cancelled", label: "Cancelled", color: "#ef4444", isClosed: true, isDefault: false, order: 3 },
];

const TASK_PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  high: { label: "High", className: "bg-red-100 text-[#AA8038]" },
  normal: { label: "Normal", className: "bg-orange-100 text-orange-700" },
  low: { label: "Low", className: "bg-gray-100 text-gray-500" },
};

const DEFAULT_PROJECT_FORM_FIELDS: ProjectFormField[] = [
  {
    id: "core_name",
    key: "name",
    label: "Company Name",
    type: "text",
    source: "core",
    coreKey: "name",
    enabled: true,
    required: true,
    order: 1,
    placeholder: "Enter company name",
    helpText: "",
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
    order: 2,
    placeholder: "Describe your company",
    helpText: "",
    options: [],
    multiple: false,
    accept: "",
    metadataFields: [],
  },
  {
    id: "core_category",
    key: "categoryId",
    label: "Category",
    type: "select",
    source: "core",
    coreKey: "categoryId",
    enabled: true,
    required: false,
    order: 3,
    placeholder: "",
    helpText: "",
    options: [],
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
    order: 4,
    placeholder: "",
    helpText: "",
    options: ["active", "completed", "archived"],
    multiple: false,
    accept: "",
    metadataFields: [],
  },
  {
    id: "core_start_date",
    key: "startDate",
    label: "Start Date",
    type: "date",
    source: "core",
    coreKey: "startDate",
    enabled: true,
    required: false,
    order: 5,
    placeholder: "",
    helpText: "",
    options: [],
    multiple: false,
    accept: "",
    metadataFields: [],
  },
  {
    id: "core_end_date",
    key: "endDate",
    label: "End Date",
    type: "date",
    source: "core",
    coreKey: "endDate",
    enabled: true,
    required: false,
    order: 6,
    placeholder: "",
    helpText: "",
    options: [],
    multiple: false,
    accept: "",
    metadataFields: [],
  },
];

const MEMBER_COLORS = [
  "bg-primary/10 text-primary",
  "bg-purple-100 text-purple-700",
  "bg-green-100 text-green-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function displayName(user: { name: string; fullname: string }): string {
  return user.fullname || user.name;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "-";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString();
}

function toHtml(value: string | null | undefined): string {
  if (!value) return "";
  if (/<[^>]+>/.test(value)) return value;
  return value.replace(/\n/g, "<br/>");
}

function toText(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWithinCommentWindow(createdAt: string, windowMinutes: number) {
  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return false;
  return Date.now() - createdAtMs <= windowMinutes * 60 * 1000;
}

function normalizeTaskStatus(status?: string | null): string {
  if (!status) return "todo";
  return status.toLowerCase().replace("-", "_");
}

function normalizeWorkflowStages(input?: WorkflowStage[] | null): WorkflowStage[] {
  if (!Array.isArray(input) || input.length === 0) return DEFAULT_PROJECT_TASK_STAGES;
  const stages = input
    .map((stage, index) => ({
      key: normalizeTaskStatus(stage.key),
      label: String(stage.label || stage.key || "").trim() || normalizeTaskStatus(stage.key),
      color: /^#[0-9a-f]{6}$/i.test(stage.color) ? stage.color : "#64748b",
      isClosed: Boolean(stage.isClosed),
      isDefault: Boolean(stage.isDefault),
      order: typeof stage.order === "number" ? stage.order : index,
    }))
    .filter((stage) => Boolean(stage.key));
  if (stages.length === 0) return DEFAULT_PROJECT_TASK_STAGES;
  if (!stages.some((stage) => stage.isDefault)) {
    stages[0] = { ...stages[0], isDefault: true };
  }
  return stages.sort((a, b) => a.order - b.order);
}

function stageStyle(color: string) {
  return {
    backgroundColor: `${color}1A`,
    borderColor: `${color}3D`,
    color,
  };
}

function getTaskStage(stages: WorkflowStage[], status?: string | null): WorkflowStage {
  if (stages.length === 0) return DEFAULT_PROJECT_TASK_STAGES[0];
  const normalized = normalizeTaskStatus(status);
  return stages.find((stage) => stage.key === normalized) ?? stages.find((stage) => stage.isDefault) ?? stages[0];
}

function getTaskStageLabel(stages: WorkflowStage[], status?: string | null): string {
  const normalized = normalizeTaskStatus(status);
  const match = stages.find((stage) => stage.key === normalized);
  if (match) return match.label;
  return normalized
    .split("_")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function isTaskClosed(stages: WorkflowStage[], status?: string | null): boolean {
  const normalized = normalizeTaskStatus(status);
  const match = stages.find((stage) => stage.key === normalized);
  if (match) return match.isClosed;
  return normalized.includes("done") || normalized.includes("complete") || normalized.includes("closed") || normalized.includes("cancel");
}

function getNextTaskStageKey(stages: WorkflowStage[], status?: string | null): string {
  if (stages.length === 0) return "todo";
  const normalized = normalizeTaskStatus(status);
  const currentIndex = stages.findIndex((stage) => stage.key === normalized);
  if (currentIndex < 0) return stages[0].key;
  const nextIndex = (currentIndex + 1) % stages.length;
  return stages[nextIndex].key;
}

function normalizeProjectTask(task: ProjectTask): ProjectTask {
  return {
    ...task,
    status: normalizeTaskStatus(task.status),
    allowAssigneeComments: task.allowAssigneeComments ?? true,
  };
}

function calcProgress(tasks: ProjectTask[], stages: WorkflowStage[]): number {
  if (!tasks.length) return 0;
  const done = tasks.filter((task) => isTaskClosed(stages, task.status)).length;
  return Math.round((done / tasks.length) * 100);
}
// ─── Create / Edit Project Dialog ─────────────────────────────────────────────

type ProjectFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSaved: (project: Project) => void;
  onDeleted?: (id: string) => void;
  categories: ProjectCategory[];
  formFields: ProjectFormField[];
  existing?: Project;
  canManageProject?: boolean;
};

function ProjectFormDialog({
  open,
  onClose,
  onSaved,
  onDeleted,
  categories,
  formFields,
  existing,
  canManageProject = true,
}: ProjectFormDialogProps) {
  const isEdit = Boolean(existing);
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(normalizeRichText(existing?.description ?? ""));
  const [categoryId, setCategoryId] = useState(existing?.category?.id ?? "");
  const [startDate, setStartDate] = useState(existing?.startDate ? existing.startDate.slice(0, 10) : "");
  const [endDate, setEndDate] = useState(existing?.endDate ? existing.endDate.slice(0, 10) : "");
  const [status, setStatus] = useState(existing?.status ?? "active");
  const [customData, setCustomData] = useState<Record<string, unknown>>(
    existing?.customData && typeof existing.customData === "object"
      ? (existing.customData as Record<string, unknown>)
      : {}
  );
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadingFieldKey, setUploadingFieldKey] = useState<string | null>(null);

  const enabledFields = useMemo(
    () => [...formFields].filter((field) => field.enabled).sort((a, b) => a.order - b.order),
    [formFields]
  );

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setDescription(normalizeRichText(existing?.description ?? ""));
      setCategoryId(existing?.category?.id ?? "");
      setStartDate(existing?.startDate ? existing.startDate.slice(0, 10) : "");
      setEndDate(existing?.endDate ? existing.endDate.slice(0, 10) : "");
      setStatus(existing?.status ?? "active");
      setCustomData(
        existing?.customData && typeof existing.customData === "object"
          ? (existing.customData as Record<string, unknown>)
          : {}
      );
      setConfirmDelete(false);
    }
  }, [open, existing, formFields]);

  function updateCustomValue(key: string, value: unknown) {
    setCustomData((prev) => ({ ...prev, [key]: value }));
  }

  function removeCustomValue(key: string) {
    setCustomData((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function uploadProjectFormFile(field: ProjectFormField, file: File) {
    setUploadingFieldKey(field.key);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/projects/uploads", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; fileName?: string; size?: number; mimeType?: string; error?: string }
        | null;
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? "Upload failed");
      }
      const entry = {
        url: data.url,
        fileName: data.fileName || file.name,
        size: data.size ?? file.size,
        mimeType: data.mimeType || file.type || "application/octet-stream",
        metadata: {},
      };

      setCustomData((prev) => {
        const currentRaw = prev[field.key];
        const current = Array.isArray(currentRaw) ? currentRaw : [];
        const next = field.multiple ? [...current, entry] : [entry];
        return { ...prev, [field.key]: next };
      });
      toast.success("File uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "File upload failed");
    } finally {
      setUploadingFieldKey(null);
    }
  }

  function validateRequiredFields() {
    for (const field of enabledFields) {
      if (!field.required) continue;
      if (field.source === "core") {
        if (field.coreKey === "name" && !name.trim()) return `${field.label} is required`;
        if (
          field.coreKey === "description" &&
          !hasRichTextContent(description)
        ) {
          return `${field.label} is required`;
        }
        if (field.coreKey === "categoryId" && !categoryId) return `${field.label} is required`;
        if (field.coreKey === "status" && !status) return `${field.label} is required`;
        if (field.coreKey === "startDate" && !startDate) return `${field.label} is required`;
        if (field.coreKey === "endDate" && !endDate) return `${field.label} is required`;
        continue;
      }

      const value = customData[field.key];
      if (value === undefined || value === null || value === "") return `${field.label} is required`;
      if (field.type === "multiselect" && (!Array.isArray(value) || value.length === 0)) {
        return `${field.label} is required`;
      }
      if (field.type === "file" && (!Array.isArray(value) || value.length === 0)) {
        return `${field.label} is required`;
      }
      if (field.type === "file" && Array.isArray(value) && value.length > 0) {
        for (const [fileIndex, fileEntry] of value.entries()) {
          const row =
            fileEntry && typeof fileEntry === "object"
              ? (fileEntry as Record<string, unknown>)
              : {};
          const meta =
            row.metadata && typeof row.metadata === "object"
              ? (row.metadata as Record<string, unknown>)
              : {};
          for (const metaField of field.metadataFields) {
            if (!metaField.required) continue;
            const metaValue = meta[metaField.key];
            if (metaValue === undefined || metaValue === null || metaValue === "") {
              return `${field.label}: ${metaField.label} is required for file #${fileIndex + 1}`;
            }
          }
        }
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const requiredError = validateRequiredFields();
    if (requiredError) {
      toast.error(requiredError);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim() || undefined,
        description: hasRichTextContent(description) ? normalizeRichText(description) : undefined,
        categoryId: categoryId || null,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status,
        customData,
      };
      const url = isEdit ? `/api/projects/${existing!.id}` : "/api/projects";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to save company");
      }
      const saved = (await res.json()) as Project;
      toast.success(isEdit ? "Company updated" : "Company created");
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save company");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${existing.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to delete company");
      }
      toast.success("Company deleted");
      onDeleted?.(existing.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete company");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-4xl">
        <DialogHeader className="border-b bg-gradient-to-r from-slate-50 via-red-50 to-slate-50 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <FolderKanban className="h-5 w-5 text-[#AA8038]" />
            {isEdit ? "Edit Company" : "Create New Company"}
          </DialogTitle>
          <DialogDescription>Define timeline, category, and scope clearly before execution.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-6 py-5">
          {enabledFields.map((field) => {
            const isRequired = field.required;
            const label = (
              <Label className="text-sm">
                {field.label}
                {isRequired ? <span className="ml-1 text-red-500">*</span> : null}
              </Label>
            );

            if (field.source === "core") {
              if (field.coreKey === "name") {
                return (
                  <div key={field.id} className="space-y-1.5">
                    {label}
                    <Input
                      placeholder={field.placeholder || "Company name"}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoFocus
                    />
                    {field.helpText ? <p className="text-xs text-slate-500">{field.helpText}</p> : null}
                  </div>
                );
              }

              if (field.coreKey === "description") {
                return (
                  <div key={field.id} className="space-y-1.5">
                    {label}
                    {field.type === "rich_text" ? (
                      <RichTextEditor
                        value={description}
                        onChange={setDescription}
                          placeholder={field.placeholder || "What is this company about?"}
                        minHeight={140}
                        disabled={submitting}
                      />
                    ) : field.type === "textarea" ? (
                      <Textarea
                          placeholder={field.placeholder || "What is this company about?"}
                        rows={4}
                        value={toText(description)}
                        onChange={(event) => setDescription(normalizeRichText(event.target.value))}
                      />
                    ) : (
                      <Input
                        placeholder={field.placeholder || "Company description"}
                        value={toText(description)}
                        onChange={(event) => setDescription(normalizeRichText(event.target.value))}
                      />
                    )}
                    {field.helpText ? <p className="text-xs text-slate-500">{field.helpText}</p> : null}
                  </div>
                );
              }

              if (field.coreKey === "categoryId") {
                return (
                  <div key={field.id} className="space-y-1.5">
                    {label}
                    <Select
                      value={categoryId || "none"}
                      onValueChange={(value) => setCategoryId(value === "none" ? "" : value ?? "")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.helpText ? <p className="text-xs text-slate-500">{field.helpText}</p> : null}
                  </div>
                );
              }

              if (field.coreKey === "status") {
                return (
                  <div key={field.id} className="space-y-1.5">
                    {label}
                    <Select value={status} onValueChange={(value) => setStatus(value ?? "active")}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                          <SelectItem key={key} value={key}>
                            {cfg.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.helpText ? <p className="text-xs text-slate-500">{field.helpText}</p> : null}
                  </div>
                );
              }

              if (field.coreKey === "startDate" || field.coreKey === "endDate") {
                const isStart = field.coreKey === "startDate";
                return (
                  <div key={field.id} className="space-y-1.5">
                    {label}
                    <Input
                      type="date"
                      value={isStart ? startDate : endDate}
                      onChange={(event) =>
                        isStart ? setStartDate(event.target.value) : setEndDate(event.target.value)
                      }
                    />
                    {field.helpText ? <p className="text-xs text-slate-500">{field.helpText}</p> : null}
                  </div>
                );
              }
            }

            const value = customData[field.key];
            const descriptionText = field.helpText ? (
              <p className="text-xs text-slate-500">{field.helpText}</p>
            ) : null;

            if (field.type === "rich_text") {
              return (
                <div key={field.id} className="space-y-1.5">
                  {label}
                  <RichTextEditor
                    value={typeof value === "string" ? value : ""}
                    onChange={(next) => updateCustomValue(field.key, normalizeRichText(next))}
                    placeholder={field.placeholder || "Enter details..."}
                    minHeight={130}
                    disabled={submitting}
                  />
                  {descriptionText}
                </div>
              );
            }

            if (field.type === "textarea") {
              return (
                <div key={field.id} className="space-y-1.5">
                  {label}
                  <Textarea
                    rows={4}
                    value={typeof value === "string" ? value : ""}
                    onChange={(event) => updateCustomValue(field.key, event.target.value)}
                    placeholder={field.placeholder || ""}
                  />
                  {descriptionText}
                </div>
              );
            }

            if (field.type === "select") {
              return (
                <div key={field.id} className="space-y-1.5">
                  {label}
                  <Select
                    value={typeof value === "string" && value ? value : "none"}
                    onValueChange={(next) => {
                      if (next === "none") removeCustomValue(field.key);
                      else updateCustomValue(field.key, next);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={field.placeholder || "Select option"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {field.options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {descriptionText}
                </div>
              );
            }

            if (field.type === "multiselect") {
              const selected = Array.isArray(value) ? value.map((item) => String(item)) : [];
              return (
                <div key={field.id} className="space-y-1.5">
                  {label}
                  <div className="grid gap-1 rounded-md border p-2 sm:grid-cols-2">
                    {field.options.map((option) => {
                      const checked = selected.includes(option);
                      return (
                        <label key={option} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...selected, option]
                                : selected.filter((item) => item !== option);
                              if (next.length === 0) removeCustomValue(field.key);
                              else updateCustomValue(field.key, next);
                            }}
                          />
                          {option}
                        </label>
                      );
                    })}
                  </div>
                  {descriptionText}
                </div>
              );
            }

            if (field.type === "checkbox") {
              return (
                <div key={field.id} className="space-y-1.5">
                  <label className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) => updateCustomValue(field.key, event.target.checked)}
                    />
                    {field.label}
                    {isRequired ? <span className="text-red-500">*</span> : null}
                  </label>
                  {descriptionText}
                </div>
              );
            }

            if (field.type === "file") {
              const files = Array.isArray(value)
                ? (value as Array<Record<string, unknown>>)
                : [];
              return (
                <div key={field.id} className="space-y-1.5 rounded-lg border p-3">
                  {label}
                  <Input
                    type="file"
                    multiple={field.multiple}
                    accept={field.accept || undefined}
                    onChange={(event) => {
                      const picked = Array.from(event.target.files ?? []);
                      if (picked.length === 0) return;
                      void Promise.all(picked.map((file) => uploadProjectFormFile(field, file)));
                      event.currentTarget.value = "";
                    }}
                    disabled={uploadingFieldKey === field.key}
                  />
                  {uploadingFieldKey === field.key ? (
                    <p className="text-xs text-slate-500">Uploading...</p>
                  ) : null}
                  {files.length > 0 ? (
                    <div className="space-y-2">
                      {files.map((file, index) => {
                        const fileName = String(file.fileName ?? "Uploaded file");
                        const metadata =
                          file.metadata && typeof file.metadata === "object"
                            ? (file.metadata as Record<string, unknown>)
                            : {};
                        return (
                          <div key={`${fileName}-${index}`} className="rounded border bg-slate-50 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <a
                                className="truncate text-sm text-[#AA8038] hover:underline"
                                href={String(file.url ?? "#")}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {fileName}
                              </a>
                              <button
                                type="button"
                                className="text-xs text-red-600 hover:underline"
                                onClick={() => {
                                  const next = [...files];
                                  next.splice(index, 1);
                                  if (next.length === 0) removeCustomValue(field.key);
                                  else updateCustomValue(field.key, next);
                                }}
                              >
                                Remove
                              </button>
                            </div>
                            {field.metadataFields.length > 0 ? (
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {field.metadataFields.map((meta) => {
                                  const metaVal = metadata[meta.key];
                                  const updateMeta = (nextValue: unknown) => {
                                    const nextFiles = [...files];
                                    const current = { ...(nextFiles[index] ?? {}) };
                                    const currentMeta =
                                      current.metadata && typeof current.metadata === "object"
                                        ? { ...(current.metadata as Record<string, unknown>) }
                                        : {};
                                    if (nextValue === "" || nextValue === undefined || nextValue === null) {
                                      delete currentMeta[meta.key];
                                    } else {
                                      currentMeta[meta.key] = nextValue;
                                    }
                                    current.metadata = currentMeta;
                                    nextFiles[index] = current;
                                    updateCustomValue(field.key, nextFiles);
                                  };
                                  return (
                                    <div key={meta.id} className="space-y-1">
                                      <Label className="text-xs">
                                        {meta.label}
                                        {meta.required ? <span className="ml-1 text-red-500">*</span> : null}
                                      </Label>
                                      {meta.type === "checkbox" ? (
                                        <label className="flex items-center gap-2 text-sm">
                                          <input
                                            type="checkbox"
                                            checked={Boolean(metaVal)}
                                            onChange={(event) => updateMeta(event.target.checked)}
                                          />
                                          Yes
                                        </label>
                                      ) : meta.type === "select" ? (
                                        <Select
                                          value={typeof metaVal === "string" && metaVal ? metaVal : "none"}
                                          onValueChange={(next) => updateMeta(next === "none" ? "" : next)}
                                        >
                                          <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            {meta.options.map((option) => (
                                              <SelectItem key={option} value={option}>
                                                {option}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <Input
                                          type={
                                            meta.type === "number"
                                              ? "number"
                                              : meta.type === "date"
                                              ? "date"
                                              : meta.type === "datetime"
                                              ? "datetime-local"
                                              : "text"
                                          }
                                          value={typeof metaVal === "string" || typeof metaVal === "number" ? String(metaVal) : ""}
                                          onChange={(event) => updateMeta(event.target.value)}
                                          placeholder={meta.placeholder || ""}
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {descriptionText}
                </div>
              );
            }

            const inputType =
              field.type === "number"
                ? "number"
                : field.type === "date"
                ? "date"
                : field.type === "datetime"
                ? "datetime-local"
                : field.type === "email"
                ? "email"
                : field.type === "url"
                ? "url"
                : "text";

            return (
              <div key={field.id} className="space-y-1.5">
                {label}
                <Input
                  type={inputType}
                  value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
                  onChange={(event) => updateCustomValue(field.key, event.target.value)}
                  placeholder={field.placeholder || ""}
                />
                {descriptionText}
              </div>
            );
          })}

          {isEdit && canManageProject ? (
            <div className="pt-1 border-t">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-red-600 flex-1">Delete this company permanently?</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
                  <Button type="button" size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => void handleDelete()} disabled={deleting}>
                    {deleting ? "Deleting..." : "Yes, Delete"}
                  </Button>
                </div>
              ) : (
                <Button type="button" size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete Company
                </Button>
              )}
            </div>
          ) : null}

          <DialogFooter className="border-t pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting} style={{ backgroundColor: "#AA8038", color: "#fff" }}>
              {submitting ? "Saving..." : isEdit ? "Save Changes" : "Create Company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add / Edit Task Dialog ───────────────────────────────────────────────────

type TaskDialogProps = {
  open: boolean;
  onClose: () => void;
  onSaved: (task: ProjectTask) => void;
  onDeleted?: (taskId: string) => void;
  projectId: string;
  stages: WorkflowStage[];
  phases: ProjectPhaseItem[];
  members: ProjectMember[];
  existing?: ProjectTask;
};

function TaskDialog({ open, onClose, onSaved, onDeleted, projectId, stages, phases, members, existing }: TaskDialogProps) {
  const isEdit = Boolean(existing);
  const stageOptions = useMemo(() => normalizeWorkflowStages(stages), [stages]);
  const defaultStage = stageOptions.find((stage) => stage.isDefault) ?? stageOptions[0];
  const resolveStatus = useCallback((value?: string | null) => {
    const normalized = normalizeTaskStatus(value);
    return stageOptions.some((stage) => stage.key === normalized) ? normalized : defaultStage.key;
  }, [defaultStage.key, stageOptions]);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(normalizeRichText(existing?.description ?? ""));
  const [status, setStatus] = useState(resolveStatus(existing?.status));
  const [priority, setPriority] = useState(existing?.priority ?? "normal");
  const [assigneeId, setAssigneeId] = useState(existing?.assignee?.id ?? "");
  const [phaseId, setPhaseId] = useState(existing?.phase?.id ?? "");
  const [dueDate, setDueDate] = useState(existing?.dueDate ? existing.dueDate.slice(0, 10) : "");
  const [allowAssigneeComments, setAllowAssigneeComments] = useState(
    existing?.allowAssigneeComments ?? true
  );
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(existing?.title ?? "");
      setDescription(normalizeRichText(existing?.description ?? ""));
      setStatus(resolveStatus(existing?.status));
      setPriority(existing?.priority ?? "normal");
      setAssigneeId(existing?.assignee?.id ?? "");
      setPhaseId(existing?.phase?.id ?? "");
      setDueDate(existing?.dueDate ? existing.dueDate.slice(0, 10) : "");
      setAllowAssigneeComments(existing?.allowAssigneeComments ?? true);
      setConfirmDelete(false);
    }
  }, [open, existing, resolveStatus]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: hasRichTextContent(description) ? normalizeRichText(description) : null,
        status,
        priority,
        assigneeId: assigneeId || null,
        phaseId: phaseId || null,
        dueDate: dueDate || null,
        allowAssigneeComments,
      };
      const url = isEdit
        ? `/api/projects/${projectId}/tasks/${existing!.id}`
        : `/api/projects/${projectId}/tasks`;
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to save task");
      }
      const saved = normalizeProjectTask((await res.json()) as ProjectTask);
      toast.success(isEdit ? "Task updated" : "Task added");
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${existing.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete task");
      toast.success("Task deleted");
      onDeleted?.(existing.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setDeleting(false);
    }
  }

  function setDuePreset(daysFromToday: number) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() + daysFromToday);
    const value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setDueDate(value);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-3xl">
        <DialogHeader className="border-b bg-gradient-to-r from-slate-50 via-red-50 to-slate-50 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <CheckSquare className="h-5 w-5 text-[#AA8038]" />
            {isEdit ? "Edit Company Task" : "Add Company Task"}
          </DialogTitle>
          <DialogDescription>Track ownership, timeline, and delivery state clearly.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Title *</Label>
            <Input id="t-title" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Description</Label>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="Write task details..."
              minHeight={140}
              disabled={submitting}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v ?? defaultStage.key)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stageOptions.map((stage) => (
                    <SelectItem key={stage.key} value={stage.key}>{stage.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v ?? "normal")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_PRIORITY_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select value={assigneeId || "unassigned"} onValueChange={(v) => setAssigneeId(v === "unassigned" ? "" : (v ?? ""))} items={{ "unassigned": "Unassigned", ...Object.fromEntries(members.map((m) => [m.user.id, displayName(m.user)])) }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user.id} value={m.user.id}>{displayName(m.user)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phase</Label>
              <Select value={phaseId || "none"} onValueChange={(v) => setPhaseId(v === "none" ? "" : (v ?? ""))} items={{ "none": "No phase", ...Object.fromEntries(phases.map((p) => [p.id, p.name])) }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="No phase" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No phase</SelectItem>
                  {phases.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-due" className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Due Date</Label>
            <Input id="t-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#AA8038]"
              checked={allowAssigneeComments}
              onChange={(e) => setAllowAssigneeComments(e.target.checked)}
              disabled={submitting}
            />
            Allow assignee to comment
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDuePreset(0)}>Today</Button>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDuePreset(1)}>Tomorrow</Button>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDuePreset(3)}>In 3 Days</Button>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDuePreset(7)}>Next Week</Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-slate-500 hover:text-slate-700" onClick={() => setDueDate("")}>Clear</Button>
          </div>

          {isEdit && (
            <div className="pt-1 border-t">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-red-600 flex-1">Delete this task permanently?</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  <Button type="button" size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => void handleDelete()} disabled={deleting}>
                    {deleting ? "Deleting..." : "Yes, Delete"}
                  </Button>
                </div>
              ) : (
                <Button type="button" size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete Task
                </Button>
              )}
            </div>
          )}

          <DialogFooter className="border-t pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting} style={{ backgroundColor: "#AA8038", color: "#fff" }}>
              {submitting ? "Saving..." : isEdit ? "Save Changes" : "Add Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Phase Dialog ─────────────────────────────────────────────────────────

type ProjectTaskDetailDialogProps = {
  open: boolean;
  onClose: () => void;
  task: ProjectTask | null;
  projectId: string;
  meId: string;
  stages: WorkflowStage[];
  canWrite: boolean;
  canManageConversation: boolean;
  onEditTask: (task: ProjectTask) => void;
};

function ProjectTaskDetailDialog({
  open,
  onClose,
  task,
  projectId,
  meId,
  stages,
  canWrite,
  canManageConversation,
  onEditTask,
}: ProjectTaskDetailDialogProps) {
  const [comments, setComments] = useState<ProjectTaskComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentHtml, setEditingCommentHtml] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [replyToComment, setReplyToComment] = useState<ProjectTaskComment | null>(null);
  const [collapsedReplies, setCollapsedReplies] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !task) return;
    setComments([]);
    setCommentText("");
    setEditingCommentId(null);
    setEditingCommentHtml("");
    setReplyToComment(null);
    setCollapsedReplies({});
    setLoadingComments(true);
    fetch(`/api/projects/${projectId}/tasks/${task.id}/comments`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setComments(
            data.map((comment) => {
              const entry = comment as Partial<ProjectTaskComment>;
              return {
                id: String(entry.id ?? ""),
                projectTaskId: typeof entry.projectTaskId === "string" ? entry.projectTaskId : task.id,
                userId: typeof entry.userId === "string" ? entry.userId : entry.user?.id,
                parentCommentId:
                  typeof entry.parentCommentId === "string" && entry.parentCommentId.trim()
                    ? entry.parentCommentId
                    : null,
                content: String(entry.content ?? ""),
                createdAt: String(entry.createdAt ?? new Date().toISOString()),
                updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : undefined,
                user: {
                  id: String(entry.user?.id ?? ""),
                  name: String(entry.user?.name ?? ""),
                  fullname: String(entry.user?.fullname ?? ""),
                },
              };
            })
          );
        }
      })
      .catch(() => toast.error("Failed to load comments"))
      .finally(() => setLoadingComments(false));
  }, [open, projectId, task]);

  useEffect(() => {
    if (comments.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  async function postComment() {
    if (!task || !hasRichTextContent(commentText)) return;
    const content = normalizeRichText(commentText);
    if (!content) return;
    setPosting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          parentCommentId: replyToComment?.id ?? null,
        }),
      });
      const data = (await response.json().catch(() => null)) as ProjectTaskComment | { error?: string } | null;
      if (!response.ok || !data || "error" in data) {
        throw new Error((data as { error?: string } | null)?.error ?? "Failed to post comment");
      }
      const created = data as ProjectTaskComment;
      setComments((prev) => [
        ...prev,
        {
          ...created,
          parentCommentId: created.parentCommentId ?? null,
        },
      ]);
      setCommentText("");
      setReplyToComment(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  }

  async function saveCommentEdit() {
    if (!task || !editingCommentId) return;
    const content = normalizeRichText(editingCommentHtml);
    if (!hasRichTextContent(content)) {
      toast.error("Comment cannot be empty");
      return;
    }
    setSavingEdit(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}/comments/${editingCommentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await response.json().catch(() => null)) as ProjectTaskComment | { error?: string } | null;
      if (!response.ok || !data || "error" in data) {
        throw new Error((data as { error?: string } | null)?.error ?? "Failed to update comment");
      }
      const updated = data as ProjectTaskComment;
      setComments((prev) =>
        prev.map((item) =>
          item.id === updated.id ? { ...updated, parentCommentId: updated.parentCommentId ?? null } : item
        )
      );
      setEditingCommentId(null);
      setEditingCommentHtml("");
      toast.success("Conversation updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update comment");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteComment(commentId: string) {
    if (!task) return;
    setDeletingCommentId(commentId);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/tasks/${task.id}/comments/${commentId}`,
        { method: "DELETE" }
      );
      const data = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;
      if (!response.ok || data?.success !== true) {
        throw new Error(data?.error ?? "Failed to delete comment");
      }
      setComments((prev) => prev.filter((item) => item.id !== commentId));
      if (editingCommentId === commentId) {
        setEditingCommentId(null);
        setEditingCommentHtml("");
      }
      if (replyToComment?.id === commentId) {
        setReplyToComment(null);
      }
      toast.success("Conversation deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete comment");
    } finally {
      setDeletingCommentId(null);
    }
  }

  const canEditTask = task?.canEditTask ?? canWrite;
  const canComment = task?.canComment ?? canWrite;
  const conversationAuthorEditDeleteWindowMinutes =
    task?.conversationAuthorEditDeleteWindowMinutes ?? 5;
  const commentTree = useMemo(() => buildThreadTree(comments), [comments]);
  const threadMeta = useMemo(() => {
    const meta: Record<string, { descendants: number; depth: number }> = {};
    const walk = (node: ThreadNode<ProjectTaskComment>) => {
      let descendants = 0;
      let depth = 1;
      for (const child of node.replies) {
        walk(child);
        const childMeta = meta[child.id] ?? { descendants: 0, depth: 1 };
        descendants += 1 + childMeta.descendants;
        depth = Math.max(depth, 1 + childMeta.depth);
      }
      meta[node.id] = { descendants, depth };
    };
    for (const root of commentTree) walk(root);
    return meta;
  }, [commentTree]);
  const autoCollapsedReplies = useMemo(() => {
    const initial: Record<string, boolean> = {};
    for (const [id, meta] of Object.entries(threadMeta)) {
      if (meta.descendants >= 4 || meta.depth >= 4) {
        initial[id] = true;
      }
    }
    return initial;
  }, [threadMeta]);
  useEffect(() => {
    setCollapsedReplies((prev) => ({ ...autoCollapsedReplies, ...prev }));
  }, [autoCollapsedReplies]);

  if (!task) return null;

  const renderCommentNode = (comment: ThreadNode<ProjectTaskComment>, depth: number) => {
    const isMe = comment.user.id === meId;
    const isWithinAuthorWindow = isWithinCommentWindow(
      comment.createdAt,
      conversationAuthorEditDeleteWindowMinutes
    );
    const canMutateComment = canManageConversation || (isMe && isWithinAuthorWindow);
    const isEditing = editingCommentId === comment.id;
    const hasReplies = comment.replies.length > 0;
    const replyMeta = threadMeta[comment.id] ?? { descendants: 0, depth: 1 };
    const isRepliesCollapsed = collapsedReplies[comment.id] ?? false;
    const depthOffset = Math.min(depth, 6) * 14;

    return (
      <div key={comment.id} className="space-y-2" style={{ marginLeft: `${depthOffset}px` }}>
        <div
          className={cn(
            "rounded-2xl border px-3 py-3 shadow-sm",
            isMe
              ? "border-[#AA8038]/35 bg-gradient-to-br from-[#AA8038]/[0.08] to-white"
              : "border-slate-200/90 bg-white"
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 shadow-sm">
              {(comment.user.fullname || comment.user.name || "?")[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2 text-[11px] text-slate-500">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">
                    {displayName(comment.user)}
                  </span>
                  {isMe ? (
                    <span className="rounded-full bg-[#AA8038]/10 px-2 py-0.5 text-[10px] font-semibold text-[#C78100]">
                      You
                    </span>
                  ) : null}
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
                    {new Date(comment.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {canComment && !isEditing ? (
                    <button
                      type="button"
                      className="rounded-full border border-transparent px-2 py-0.5 text-[11px] font-medium text-[#C78100] hover:border-[#AA8038]/20 hover:bg-[#AA8038]/10"
                      onClick={() => {
                        setReplyToComment(comment);
                        setEditingCommentId(null);
                        setEditingCommentHtml("");
                      }}
                    >
                      <Reply className="mr-1 inline h-3 w-3" />
                      Reply
                    </button>
                  ) : null}
                  {canMutateComment && !isEditing ? (
                    <button
                      type="button"
                      className="rounded-full border border-transparent px-2 py-0.5 text-[11px] font-medium text-[#C78100] hover:border-[#AA8038]/20 hover:bg-[#AA8038]/10"
                      onClick={() => {
                        setEditingCommentId(comment.id);
                        setEditingCommentHtml(normalizeRichText(toHtml(comment.content)));
                      }}
                    >
                      Edit
                    </button>
                  ) : null}
                  {canMutateComment && !isEditing ? (
                    <button
                      type="button"
                      className="rounded-full border border-transparent px-2 py-0.5 text-[11px] font-medium text-red-600 hover:border-red-200 hover:bg-red-50"
                      onClick={() => void deleteComment(comment.id)}
                      disabled={deletingCommentId === comment.id}
                    >
                      {deletingCommentId === comment.id ? (
                        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 inline h-3 w-3" />
                      )}
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
              {isEditing ? (
                <div className="space-y-2 rounded-lg border bg-white p-2">
                  <RichTextEditor
                    value={editingCommentHtml}
                    onChange={setEditingCommentHtml}
                    placeholder="Edit conversation..."
                    minHeight={100}
                    disabled={savingEdit}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingCommentId(null);
                        setEditingCommentHtml("");
                      }}
                      disabled={savingEdit}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-[#AA8038] text-white hover:bg-[#D48A00]"
                      onClick={() => void saveCommentEdit()}
                      disabled={savingEdit || !hasRichTextContent(editingCommentHtml)}
                    >
                      {savingEdit ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800"
                  dangerouslySetInnerHTML={{ __html: normalizeRichText(toHtml(comment.content)) }}
                />
              )}
              {hasReplies ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-[#AA8038]/25 bg-white px-2.5 py-1 text-[11px] font-medium text-[#8A651E] hover:bg-[#AA8038]/10"
                    onClick={() =>
                      setCollapsedReplies((prev) => ({
                        ...prev,
                        [comment.id]: !(prev[comment.id] ?? false),
                      }))
                    }
                  >
                    {isRepliesCollapsed ? (
                      <ChevronRight className="mr-1 h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="mr-1 h-3.5 w-3.5" />
                    )}
                    {isRepliesCollapsed ? "Expand" : "Collapse"} thread
                  </button>
                  <span className="text-[11px] text-slate-500">
                    {replyMeta.descendants} repl
                    {replyMeta.descendants === 1 ? "y" : "ies"} in this branch
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {hasReplies && !isRepliesCollapsed
          ? comment.replies.map((reply) => renderCommentNode(reply, depth + 1))
          : null}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b bg-gradient-to-r from-slate-50 via-red-50 to-slate-50 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg leading-tight">
            <MessageSquare className="h-5 w-5 shrink-0 text-[#AA8038]" />
            <span className="line-clamp-2">{task.title}</span>
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="outline" style={stageStyle(getTaskStage(stages, task.status).color)} className="h-5 px-1.5 text-[10px]">
              {getTaskStageLabel(stages, task.status)}
            </Badge>
            <Badge variant="secondary" className={cn("h-5 px-1.5 text-[10px]", TASK_PRIORITY_CONFIG[task.priority]?.className ?? "bg-gray-100 text-gray-600")}>
              {TASK_PRIORITY_CONFIG[task.priority]?.label ?? task.priority}
            </Badge>
            {task.dueDate ? (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <CalendarDays className="h-3 w-3" />
                {formatDate(task.dueDate)}
              </span>
            ) : null}
            {canEditTask ? (
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] font-medium text-[#C78100] hover:bg-[#AA8038]/10"
                onClick={() => onEditTask(task)}
              >
                Edit task
              </button>
            ) : null}
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 space-y-3 border-b bg-white px-6 py-4 text-sm">
            <div className="flex flex-wrap gap-4 text-xs text-slate-600">
              <span>Created: <span className="font-medium text-slate-800">{formatDate(task.createdAt)}</span></span>
              <span>Assigned: <span className="font-medium text-slate-800">{task.assignee ? displayName(task.assignee) : "Unassigned"}</span></span>
              <span>Phase: <span className="font-medium text-slate-800">{task.phase?.name ?? "—"}</span></span>
            </div>
            {task.description ? (
              <div
                dir="ltr"
                className="max-h-28 overflow-auto rounded border bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700"
                dangerouslySetInnerHTML={{ __html: normalizeRichText(toHtml(task.description)) }}
              />
            ) : (
              <p className="text-xs text-slate-400 italic">No description</p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Comments ({comments.length})</p>
            {loadingComments ? (
              <div className="flex items-center justify-center py-6 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : commentTree.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No comments yet. Be the first to add one.</p>
            ) : (
              commentTree.map((comment) => renderCommentNode(comment, 0))
            )}
            <div ref={bottomRef} />
          </div>

          <div className="shrink-0 border-t bg-white px-6 py-3">
            <div className="space-y-2">
              {replyToComment ? (
                <div className="flex items-start justify-between gap-2 rounded-lg border border-[#AA8038]/30 bg-[#AA8038]/10 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#8A651E]">
                      Replying to {displayName(replyToComment.user)}
                    </p>
                    <p className="truncate text-[#8A651E]/90">
                      {toText(replyToComment.content) || "Message"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded p-1 text-[#8A651E] hover:bg-[#AA8038]/20"
                    onClick={() => setReplyToComment(null)}
                    aria-label="Cancel reply"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
              {!canComment ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  You can view this task, but commenting is disabled for this assignment.
                </div>
              ) : null}
              <RichTextEditor
                value={commentText}
                onChange={setCommentText}
                placeholder={canComment ? "Write a comment..." : "Read-only"}
                minHeight={110}
                disabled={posting || !canComment}
              />
              <div className="flex justify-end">
                <Button
                  className="h-10 bg-[#AA8038] text-white hover:bg-[#D48A00]"
                  size="icon"
                  onClick={() => void postComment()}
                  disabled={posting || !canComment || !hasRichTextContent(commentText)}
                >
                  {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type AddPhaseDialogProps = {
  open: boolean;
  onClose: () => void;
  onAdded: (phase: ProjectPhaseItem) => void;
  projectId: string;
};

function AddPhaseDialog({ open, onClose, onAdded, projectId }: AddPhaseDialogProps) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) { setName(""); setStartDate(""); setEndDate(""); }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Phase name is required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), startDate: startDate || undefined, endDate: endDate || undefined }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to add phase");
      }
      const phase = (await res.json()) as ProjectPhaseItem;
      toast.success("Phase added");
      onAdded(phase);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add phase");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Phase</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="phase-name">Name *</Label>
            <Input id="phase-name" placeholder="e.g. Planning, Development, QA" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phase-start">Start Date</Label>
              <Input id="phase-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phase-end">End Date</Label>
              <Input id="phase-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting} style={{ backgroundColor: "#AA8038", color: "#fff" }}>
              {submitting ? "Adding..." : "Add Phase"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Member Dialog ────────────────────────────────────────────────────────

type AddMemberDialogProps = {
  open: boolean;
  onClose: () => void;
  onAdded: (member: ProjectMember) => void;
  projectId: string;
  existingMemberIds: string[];
};

function AddMemberDialog({ open, onClose, onAdded, projectId, existingMemberIds }: AddMemberDialogProps) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState("member");
  const [submitting, setSubmitting] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (open) {
      setSearch(""); setSelectedUserId(""); setRole("member");
      setLoadingUsers(true);
      fetch("/api/team/users?limit=200&isActive=true")
        .then((r) => r.json())
        .then((data: TeamUser[]) => setUsers(Array.isArray(data) ? data : []))
        .catch(() => setUsers([]))
        .finally(() => setLoadingUsers(false));
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => !existingMemberIds.includes(u.id))
      .filter((u) => !q || displayName(u).toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
  }, [users, existingMemberIds, search]);

  async function handleAdd() {
    if (!selectedUserId) { toast.error("Select a user"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, role }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to add member");
      }
      const member = (await res.json()) as ProjectMember;
      toast.success("Member added");
      onAdded(member);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input placeholder="Search team members..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          </div>
          <div className="border rounded-lg overflow-y-auto max-h-52">
            {loadingUsers ? (
              <div className="p-4 text-sm text-gray-400 text-center">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-gray-400 text-center">No users found</div>
            ) : (
              filtered.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedUserId(u.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors",
                    selectedUserId === u.id && "bg-primary/5 border-l-2 border-primary"
                  )}
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-xs bg-gray-100 text-gray-600">{initials(displayName(u))}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-gray-800 truncate">{displayName(u)}</span>
                </button>
              ))
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v ?? "member")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button onClick={() => void handleAdd()} disabled={submitting || !selectedUserId} style={{ backgroundColor: "#AA8038", color: "#fff" }}>
              {submitting ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Project Detail View ──────────────────────────────────────────────────────

type ProjectDetailViewProps = {
  projectId: string;
  onBack: () => void;
  onEdit: (project: Project) => void;
};

function ProjectDetailView({ projectId, onBack, onEdit }: ProjectDetailViewProps) {
  const { can, access } = usePermissions();
  const canWrite = can("projects", "write");
  const canManage = can("projects", "manage");

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [taskStages, setTaskStages] = useState<WorkflowStage[]>(DEFAULT_PROJECT_TASK_STAGES);
  const [phases, setPhases] = useState<ProjectPhaseItem[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | undefined>(undefined);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<ProjectTask | null>(null);
  const [taskLayout, setTaskLayout] = useState<"list" | "grid" | "kanban">("list");
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [addPhaseOpen, setAddPhaseOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [deletingPhaseId, setDeletingPhaseId] = useState<string | null>(null);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);

  const loadProject = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) throw new Error("Failed to load company");
        const data = (await res.json()) as ProjectDetail;

        let nextStages = normalizeWorkflowStages(data.taskStages);
        let nextTasks = (data.tasks ?? []).map(normalizeProjectTask);
        try {
          const tasksRes = await fetch(`/api/projects/${projectId}/tasks`);
          if (tasksRes.ok) {
            const tasksData = (await tasksRes.json()) as { items?: ProjectTask[]; stages?: WorkflowStage[] };
            if (Array.isArray(tasksData.items)) {
              nextTasks = tasksData.items.map(normalizeProjectTask);
            }
            nextStages = normalizeWorkflowStages(tasksData.stages ?? nextStages);
          }
        } catch {
          // Keep project payload fallback when task endpoint is unavailable.
        }

        setDetail(data);
        setTasks(nextTasks);
        setTaskStages(nextStages);
        setPhases(data.phases ?? []);
        setMembers(data.members ?? []);
      } catch (err) {
        if (!silent) {
          toast.error(err instanceof Error ? err.message : "Failed to load company");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadProject({ silent: true });
      }
    }, 15000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadProject({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadProject]);

  const progress = useMemo(() => calcProgress(tasks, taskStages), [taskStages, tasks]);
  const tasksByStage = useMemo(() => {
    const buckets: Record<string, ProjectTask[]> = {};
    for (const stage of taskStages) buckets[stage.key] = [];
    for (const task of tasks) {
      const key = taskStages.some((stage) => stage.key === task.status)
        ? task.status
        : (taskStages[0]?.key ?? "todo");
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(task);
    }
    return buckets;
  }, [taskStages, tasks]);
  useEffect(() => {
    setActiveTask((prev) => {
      if (!prev) return null;
      return tasks.find((item) => item.id === prev.id) ?? null;
    });
  }, [tasks]);
  const currentUserId = access?.userId ?? "";
  const myMembership = useMemo(
    () => members.find((member) => member.user.id === currentUserId),
    [members, currentUserId]
  );
  const isProjectMember = Boolean(myMembership);
  const isProjectManager = myMembership?.role === "manager";
  const canProjectWrite = canWrite && (canManage || isProjectMember);
  const canProjectManage = canWrite && (canManage || isProjectManager);
  const canEditProjectTask = useCallback(
    (task: ProjectTask) => task.canEditTask ?? canProjectWrite,
    [canProjectWrite]
  );
  const canChangeProjectTaskStatus = useCallback(
    (task: ProjectTask) => task.canChangeStatus ?? canEditProjectTask(task),
    [canEditProjectTask]
  );

  function openTaskDetails(task: ProjectTask) {
    setActiveTask(task);
    setTaskDetailOpen(true);
  }

  function openTaskEditor(task?: ProjectTask) {
    setTaskDetailOpen(false);
    setEditingTask(task);
    setTaskDialogOpen(true);
  }

  async function moveTaskToStage(task: ProjectTask, nextStatus: string) {
    if (!canChangeProjectTaskStatus(task)) return;
    if (normalizeTaskStatus(task.status) === normalizeTaskStatus(nextStatus)) return;
    setTogglingTaskId(task.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      const updated = normalizeProjectTask((await res.json()) as ProjectTask);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      setActiveTask((prev) => (prev && prev.id === updated.id ? updated : prev));
    } catch {
      toast.error("Failed to update task status");
    } finally {
      setTogglingTaskId(null);
    }
  }

  async function toggleTaskStatus(task: ProjectTask) {
    if (!canChangeProjectTaskStatus(task)) return;
    const next = getNextTaskStageKey(taskStages, task.status);
    await moveTaskToStage(task, next);
  }

  async function deletePhase(phaseId: string) {
    setDeletingPhaseId(phaseId);
    try {
      const res = await fetch(`/api/projects/${projectId}/phases/${phaseId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete phase");
      setPhases((prev) => prev.filter((p) => p.id !== phaseId));
      setTasks((prev) => prev.map((t) => t.phase?.id === phaseId ? { ...t, phase: null } : t));
      toast.success("Phase deleted");
    } catch {
      toast.error("Failed to delete phase");
    } finally {
      setDeletingPhaseId(null);
    }
  }

  async function deleteMember(memberId: string) {
    setDeletingMemberId(memberId);
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove member");
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success("Member removed");
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setDeletingMemberId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <p>Company not found</p>
      </div>
    );
  }

  const existingMemberIds = members.map((m) => m.user.id);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Companies
          </button>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold text-gray-900">{detail.name}</h1>
              <Badge
                variant="secondary"
                className={cn("text-xs", STATUS_CONFIG[detail.status]?.className ?? "bg-gray-100 text-gray-600")}
              >
                {STATUS_CONFIG[detail.status]?.label ?? detail.status}
              </Badge>
            </div>
            {detail.description && (
              <p className="text-sm text-gray-500 mt-1 line-clamp-2">{detail.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 flex-wrap">
              {detail.startDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Start: {formatDate(detail.startDate)}
                </span>
              )}
              {detail.endDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Due: {formatDate(detail.endDate)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {members.length} member{members.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex -space-x-2">
              {members.slice(0, 5).map((m, idx) => (
                <Avatar key={m.id} className="h-8 w-8 border-2 border-white">
                  <AvatarFallback className={cn("text-xs font-medium", MEMBER_COLORS[idx % MEMBER_COLORS.length])}>
                    {initials(displayName(m.user))}
                  </AvatarFallback>
                </Avatar>
              ))}
              {members.length > 5 && (
                <div className="h-8 min-w-8 px-1 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-xs text-gray-600">
                  +{members.length - 5}
                </div>
              )}
            </div>
            {canProjectManage && (
              <Button size="sm" variant="outline" onClick={() => onEdit(detail)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-3">
          <Progress value={progress} className="flex-1 gap-0">
            <ProgressTrack className="h-2 bg-gray-100">
              <ProgressIndicator style={{ width: `${progress}%`, backgroundColor: "#AA8038" }} />
            </ProgressTrack>
          </Progress>
          <span className="text-xs text-gray-500 shrink-0">
            {tasks.filter((task) => isTaskClosed(taskStages, task.status)).length}/{tasks.length} completed - {progress}%
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="tasks" className="h-full flex flex-col">
          <div className="border-b bg-white px-6">
            <TabsList className="h-10 bg-transparent p-0 gap-0 border-none rounded-none">
              {[
                { value: "tasks", label: `Tasks (${tasks.length})`, Icon: CheckSquare },
                { value: "phases", label: `Phases (${phases.length})`, Icon: Layers },
                { value: "members", label: `Members (${members.length})`, Icon: Users },
              ].map(({ value, label, Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#AA8038] data-[state=active]:text-[#AA8038] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 h-10 text-sm text-gray-500"
                >
                  <Icon className="h-4 w-4 mr-1.5" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Tasks tab */}
          <TabsContent value="tasks" className="flex-1 overflow-y-auto mt-0 bg-gray-50">
            <div className="p-4">
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">
                      {tasks.length} task{tasks.length !== 1 ? "s" : ""}
                    </span>
                    <div className="inline-flex items-center rounded-md border bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => setTaskLayout("list")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                          taskLayout === "list" ? "bg-[#AA8038] text-white" : "text-gray-500 hover:bg-gray-100"
                        )}
                      >
                        <List className="h-3.5 w-3.5" />
                        List
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskLayout("grid")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                          taskLayout === "grid" ? "bg-[#AA8038] text-white" : "text-gray-500 hover:bg-gray-100"
                        )}
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        Grid
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskLayout("kanban")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                          taskLayout === "kanban" ? "bg-[#AA8038] text-white" : "text-gray-500 hover:bg-gray-100"
                        )}
                      >
                        <Columns3 className="h-3.5 w-3.5" />
                        Kanban
                      </button>
                    </div>
                  </div>
                  {canProjectWrite && (
                    <Button
                      size="sm"
                      style={{ backgroundColor: "#AA8038", color: "#fff" }}
                      onClick={() => openTaskEditor(undefined)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Task
                    </Button>
                  )}
                </div>

                {tasks.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-25" />
                    <p className="text-sm">No tasks yet</p>
                    {canProjectWrite ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => openTaskEditor(undefined)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add first task
                      </Button>
                    ) : null}
                  </div>
                ) : taskLayout === "list" ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 hover:bg-gray-50">
                        <TableHead className="pl-4">Title</TableHead>
                        <TableHead className="w-28">Status</TableHead>
                        <TableHead className="w-24">Priority</TableHead>
                        <TableHead className="w-28">Created</TableHead>
                        <TableHead className="w-36">Assignee</TableHead>
                        <TableHead className="w-28">Phase</TableHead>
                        <TableHead className="w-28">Due Date</TableHead>
                        <TableHead className="w-10 pr-4"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map((task) => {
                        const assigneeName = task.assignee ? displayName(task.assignee) : "Unassigned";
                        const canEditTaskItem = canEditProjectTask(task);
                        const canChangeStatusItem = canChangeProjectTaskStatus(task);
                        return (
                          <TableRow
                            key={task.id}
                            className="cursor-pointer hover:bg-gray-50/80"
                            onClick={() => openTaskDetails(task)}
                          >
                            <TableCell className="pl-4">
                              <span className="text-sm font-medium text-gray-800">{task.title}</span>
                              {task.description && (
                                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                                  {richTextToPlainText(task.description)}
                                </p>
                              )}
                            </TableCell>
                            <TableCell
                              onClick={(e) => {
                                if (!canChangeStatusItem) return;
                                e.stopPropagation();
                                void toggleTaskStatus(task);
                              }}
                            >
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs transition-opacity select-none",
                                  canChangeStatusItem && "cursor-pointer hover:opacity-80",
                                  togglingTaskId === task.id ? "opacity-50" : ""
                                )}
                                style={stageStyle(getTaskStage(taskStages, task.status).color)}
                                title={canChangeStatusItem ? "Click to move to next stage" : undefined}
                              >
                                {getTaskStageLabel(taskStages, task.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={cn("text-xs", TASK_PRIORITY_CONFIG[task.priority]?.className ?? "bg-gray-100 text-gray-600")}
                              >
                                {TASK_PRIORITY_CONFIG[task.priority]?.label ?? task.priority}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">{formatDateTime(task.createdAt)}</TableCell>
                            <TableCell>
                              {task.assignee ? (
                                <div className="flex items-center gap-1.5">
                                  <Avatar className="h-6 w-6">
                                    <AvatarFallback className="text-xs bg-gray-100 text-gray-600">{initials(assigneeName)}</AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm text-gray-700 truncate max-w-20">{assigneeName}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">Unassigned</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-gray-500">{task.phase?.name ?? "-"}</TableCell>
                            <TableCell className="text-xs text-gray-500">{formatDate(task.dueDate)}</TableCell>
                            <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => {
                                  if (!canEditTaskItem) return;
                                  openTaskEditor(task);
                                }}
                                className="text-gray-300 hover:text-gray-600 transition-colors p-1 rounded"
                                title="Edit task"
                                disabled={!canEditTaskItem}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : taskLayout === "grid" ? (
                  <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                    {tasks.map((task) => {
                      const assigneeName = task.assignee ? displayName(task.assignee) : "Unassigned";
                      const canEditTaskItem = canEditProjectTask(task);
                      const canChangeStatusItem = canChangeProjectTaskStatus(task);
                      return (
                        <article
                          key={task.id}
                          className="rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow"
                        >
                          <button
                            type="button"
                            className="line-clamp-2 text-left text-sm font-semibold text-slate-800 hover:text-[#AA8038] hover:underline"
                            onClick={() => openTaskDetails(task)}
                          >
                            {task.title}
                          </button>
                          {task.description ? (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                              {richTextToPlainText(task.description)}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "h-5 px-1.5 text-[10px] transition-opacity",
                                canChangeStatusItem && "cursor-pointer hover:opacity-80",
                                togglingTaskId === task.id ? "opacity-50" : ""
                              )}
                              style={stageStyle(getTaskStage(taskStages, task.status).color)}
                              onClick={() => {
                                if (!canChangeStatusItem) return;
                                void toggleTaskStatus(task);
                              }}
                              title={canChangeStatusItem ? "Click to move to next stage" : undefined}
                            >
                              {getTaskStageLabel(taskStages, task.status)}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "h-5 px-1.5 text-[10px]",
                                TASK_PRIORITY_CONFIG[task.priority]?.className ?? "bg-gray-100 text-gray-600"
                              )}
                            >
                              {TASK_PRIORITY_CONFIG[task.priority]?.label ?? task.priority}
                            </Badge>
                            {task.dueDate ? (
                              <Badge
                                variant="outline"
                                className="h-5 px-1.5 text-[10px] text-orange-700 border-orange-200 bg-orange-50"
                              >
                                {formatDate(task.dueDate)}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                            <div className="flex min-w-0 items-center gap-1.5">
                              {task.assignee ? (
                                <Avatar className="h-5 w-5">
                                  <AvatarFallback className="text-[10px] bg-gray-100 text-gray-600">
                                    {initials(assigneeName)}
                                  </AvatarFallback>
                                </Avatar>
                              ) : null}
                              <span className="truncate">{assigneeName}</span>
                            </div>
                            <span className="shrink-0 text-[10px] text-slate-400">
                              {formatDateTime(task.createdAt)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                            <span className="truncate">Phase: {task.phase?.name ?? "-"}</span>
                            <button
                              type="button"
                              className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => {
                                if (!canEditTaskItem) return;
                                openTaskEditor(task);
                              }}
                              disabled={!canEditTaskItem}
                            >
                              Edit
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="flex min-w-max gap-3 p-3">
                      {taskStages.map((stage) => {
                        const stageTasks = tasksByStage[stage.key] ?? [];
                        const stageMetaStyle = stageStyle(stage.color);
                        return (
                          <div
                            key={stage.key}
                            onDragOver={(event) => {
                              if (!canProjectWrite) return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(event) => {
                              if (!canProjectWrite) return;
                              event.preventDefault();
                              if (!dragTaskId) return;
                              const draggedTask = tasks.find((item) => item.id === dragTaskId);
                              setDragTaskId(null);
                              if (!draggedTask) return;
                              if (!canChangeProjectTaskStatus(draggedTask)) return;
                              void moveTaskToStage(draggedTask, stage.key);
                            }}
                            className={cn(
                              "w-72 shrink-0 rounded-lg border bg-slate-50/60",
                              dragTaskId && "transition-colors",
                              dragTaskId && canProjectWrite && "border-dashed border-slate-300"
                            )}
                          >
                            <div className="flex items-center justify-between border-b bg-white px-3 py-2.5">
                              <Badge variant="outline" style={stageMetaStyle} className="text-xs">
                                {stage.label}
                              </Badge>
                              <span className="text-xs text-slate-500">{stageTasks.length}</span>
                            </div>
                            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-2">
                              {stageTasks.length === 0 ? (
                                <p className="rounded-md border border-dashed border-slate-200 bg-white p-3 text-xs text-slate-400">
                                  Drop task here
                                </p>
                              ) : stageTasks.map((task) => {
                                const assigneeName = task.assignee ? displayName(task.assignee) : "Unassigned";
                                const canEditTaskItem = canEditProjectTask(task);
                                const canChangeStatusItem = canChangeProjectTaskStatus(task);
                                return (
                                  <article
                                    key={task.id}
                                    draggable={canChangeStatusItem}
                                    onDragStart={() => {
                                      if (!canChangeStatusItem) return;
                                      setDragTaskId(task.id);
                                    }}
                                    onDragEnd={() => setDragTaskId(null)}
                                    className="rounded-md border bg-white p-3 shadow-sm"
                                  >
                                    <button
                                      type="button"
                                      className="line-clamp-2 text-left text-sm font-semibold text-slate-800 hover:text-[#AA8038] hover:underline"
                                      onClick={() => openTaskDetails(task)}
                                    >
                                      {task.title}
                                    </button>
                                    {task.description ? (
                                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                        {richTextToPlainText(task.description)}
                                      </p>
                                    ) : null}
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                      <Badge variant="outline" style={stageMetaStyle} className="h-5 px-1.5 text-[10px]">
                                        {getTaskStageLabel(taskStages, task.status)}
                                      </Badge>
                                      <Badge
                                        variant="secondary"
                                        className={cn("h-5 px-1.5 text-[10px]", TASK_PRIORITY_CONFIG[task.priority]?.className ?? "bg-gray-100 text-gray-600")}
                                      >
                                        {TASK_PRIORITY_CONFIG[task.priority]?.label ?? task.priority}
                                      </Badge>
                                      {task.dueDate ? (
                                        <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-orange-700 border-orange-200 bg-orange-50">
                                          {formatDate(task.dueDate)}
                                        </Badge>
                                      ) : null}
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                                      <span className="truncate">{assigneeName}</span>
                                      <span className="shrink-0 text-[10px] text-slate-400">
                                        {formatDate(task.createdAt)}
                                      </span>
                                      <button
                                        type="button"
                                        className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                        onClick={() => {
                                          if (!canChangeStatusItem) return;
                                          void toggleTaskStatus(task);
                                        }}
                                        disabled={!canChangeStatusItem}
                                      >
                                        Next
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Phases tab */}
          <TabsContent value="phases" className="flex-1 overflow-y-auto mt-0 bg-gray-50 p-4">
            <div className="max-w-2xl space-y-3">
              {canProjectManage && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    style={{ backgroundColor: "#AA8038", color: "#fff" }}
                    onClick={() => setAddPhaseOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Phase
                  </Button>
                </div>
              )}
              {phases.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <Layers className="h-10 w-10 mx-auto mb-3 opacity-25" />
                    <p className="text-sm">No phases yet. Add one to structure your company.</p>
                </div>
              ) : (
                phases.map((phase, idx) => {
                  const phaseTasks = tasks.filter((t) => t.phase?.id === phase.id);
                  const phaseProgress = calcProgress(phaseTasks, taskStages);
                  return (
                    <div key={phase.id} className="flex items-center gap-4 p-4 bg-white rounded-xl border group">
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                        style={{ backgroundColor: "#AA8038" }}
                      >
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{phase.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          {(phase.startDate || phase.endDate) && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(phase.startDate)} – {formatDate(phase.endDate)}
                            </span>
                          )}
                          <span>{phaseTasks.length} task{phaseTasks.length !== 1 ? "s" : ""}</span>
                        </div>
                        {phaseTasks.length > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${phaseProgress}%`, backgroundColor: "#AA8038" }} />
                            </div>
                            <span className="text-xs text-gray-400 shrink-0">{phaseProgress}%</span>
                          </div>
                        )}
                      </div>
                      {canProjectManage && (
                        <button
                          onClick={() => void deletePhase(phase.id)}
                          disabled={deletingPhaseId === phase.id}
                          className="text-gray-300 hover:text-red-500 transition-colors p-1.5 rounded opacity-0 group-hover:opacity-100"
                          title="Delete phase"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* Members tab */}
          <TabsContent value="members" className="flex-1 overflow-y-auto mt-0 bg-gray-50 p-4">
            <div className="max-w-2xl space-y-3">
              {canProjectManage && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    style={{ backgroundColor: "#AA8038", color: "#fff" }}
                    onClick={() => setAddMemberOpen(true)}
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-1" />
                    Add Member
                  </Button>
                </div>
              )}
              {members.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-25" />
                  <p className="text-sm">No members yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {members.map((member, idx) => (
                    <div key={member.id} className="flex items-center gap-3 p-4 bg-white rounded-xl border group">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className={cn("text-sm font-semibold", MEMBER_COLORS[idx % MEMBER_COLORS.length])}>
                          {initials(displayName(member.user))}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{displayName(member.user)}</p>
                        <p className="text-xs text-gray-400 capitalize">{member.role}</p>
                      </div>
                      {member.role === "manager" && (
                        <Badge variant="secondary" className="text-xs shrink-0" style={{ backgroundColor: "#FFFAF0", color: "#AA8038" }}>
                          Manager
                        </Badge>
                      )}
                      {canProjectManage && (
                        <button
                          onClick={() => void deleteMember(member.id)}
                          disabled={deletingMemberId === member.id}
                          className="text-gray-300 hover:text-red-500 transition-colors p-1.5 rounded opacity-0 group-hover:opacity-100 shrink-0"
                          title="Remove member"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <ProjectTaskDetailDialog
        open={taskDetailOpen}
        onClose={() => {
          setTaskDetailOpen(false);
          setActiveTask(null);
        }}
        task={activeTask}
        projectId={projectId}
        meId={currentUserId}
        stages={taskStages}
        canWrite={canProjectWrite}
        canManageConversation={canProjectManage}
        onEditTask={(task) => openTaskEditor(task)}
      />
      <TaskDialog
        open={taskDialogOpen}
        onClose={() => { setTaskDialogOpen(false); setEditingTask(undefined); }}
        onSaved={(task) => {
          const normalizedTask = normalizeProjectTask(task);
          setTasks((prev) => {
            const exists = prev.some((t) => t.id === normalizedTask.id);
            return exists ? prev.map((t) => (t.id === normalizedTask.id ? normalizedTask : t)) : [normalizedTask, ...prev];
          });
          setActiveTask((prev) => (prev && prev.id === normalizedTask.id ? normalizedTask : prev));
        }}
        onDeleted={(id) => {
          setTasks((prev) => prev.filter((t) => t.id !== id));
          setActiveTask((prev) => (prev?.id === id ? null : prev));
          if (activeTask?.id === id) setTaskDetailOpen(false);
        }}
        projectId={projectId}
        stages={taskStages}
        phases={phases}
        members={members}
        existing={editingTask}
      />
      <AddPhaseDialog
        open={addPhaseOpen}
        onClose={() => setAddPhaseOpen(false)}
        onAdded={(phase) => setPhases((prev) => [...prev, phase])}
        projectId={projectId}
      />
      <AddMemberDialog
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        onAdded={(member) => setMembers((prev) => [...prev, member])}
        projectId={projectId}
        existingMemberIds={existingMemberIds}
      />
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

type ProjectCardProps = {
  project: Project;
  onOpen: () => void;
  onEdit: () => void;
  canEditProject: boolean;
};

function ProjectCard({ project, onOpen, onEdit, canEditProject }: ProjectCardProps) {
  const [hovered, setHovered] = useState(false);
  const tasksCount = project.tasks?.length ?? project._count.tasks;
  const doneTasks = (project.tasks ?? []).filter((task) => isTaskClosed(DEFAULT_PROJECT_TASK_STAGES, task.status)).length;
  const progress = tasksCount > 0 ? Math.round((doneTasks / tasksCount) * 100) : 0;
  const membersCount = project.members.length;

  return (
    <Card
      className="relative overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-2 gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate">{project.name}</h3>
            {project.description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{project.description}</p>
            )}
          </div>
          <Badge
            variant="secondary"
            className={cn("text-xs shrink-0", STATUS_CONFIG[project.status]?.className ?? "bg-gray-100 text-gray-600")}
          >
            {STATUS_CONFIG[project.status]?.label ?? project.status}
          </Badge>
        </div>

        {/* Progress indicator */}
        <div className="mt-3 mb-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Progress</span>
            <span className="text-gray-400">{tasksCount > 0 ? `${doneTasks}/${tasksCount} done` : "No tasks"}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: "#AA8038" }} />
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400 mb-3">
          {project.category && (
            <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
              {project.category.name}
            </Badge>
          )}
          <span className="flex items-center gap-1">
            <CheckSquare className="h-3 w-3" />
            {tasksCount} task{tasksCount !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <List className="h-3 w-3" />
            {project._count.phases} phase{project._count.phases !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex -space-x-1.5">
            {project.members.slice(0, 4).map((m, idx) => (
              <Avatar key={m.id} className="h-7 w-7 border-2 border-white">
                <AvatarFallback className={cn("text-xs font-medium", MEMBER_COLORS[idx % MEMBER_COLORS.length])}>
                  {initials(displayName(m.user))}
                </AvatarFallback>
              </Avatar>
            ))}
            {membersCount > 4 && (
              <div className="h-7 min-w-7 px-1 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-xs text-gray-600">
                +{membersCount - 4}
              </div>
            )}
            {membersCount === 0 && (
              <div className="h-7 w-7 rounded-full border-2 border-white bg-gray-50 flex items-center justify-center">
                <Users className="h-3.5 w-3.5 text-gray-400" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Calendar className="h-3 w-3" />
            {project.endDate ? formatDate(project.endDate) : "No deadline"}
          </div>
        </div>

        {/* Hover overlay */}
        {hovered && (
          <div
            className="absolute inset-0 flex items-center justify-center gap-2 bg-white/80 backdrop-blur-[1px]"
            onClick={(e) => e.stopPropagation()}
          >
            <Button size="sm" style={{ backgroundColor: "#AA8038", color: "#fff" }} onClick={onOpen}>
              Open
            </Button>
            {canEditProject && (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { can, access } = usePermissions();
  const canWrite = can("projects", "write");
  const canManage = can("projects", "manage");
  const currentUserId = access?.userId ?? "";

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState("all");
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [companyLayout, setCompanyLayout] = useState<"grid" | "list">("grid");

  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [projectFormFields, setProjectFormFields] = useState<ProjectFormField[]>(DEFAULT_PROJECT_FORM_FIELDS);

  const loadProjects = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);
      try {
        const res = await fetch("/api/projects?limit=200");
        if (!res.ok) throw new Error("Failed to load companies");
        const data = (await res.json()) as Project[];
        setProjects(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!silent) {
          toast.error(err instanceof Error ? err.message : "Failed to load companies");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/projects/form-config", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load company form config");
        const data = (await res.json()) as { fields?: ProjectFormField[] };
        if (!mounted) return;
        setProjectFormFields(
          Array.isArray(data.fields) && data.fields.length > 0
            ? data.fields
            : DEFAULT_PROJECT_FORM_FIELDS
        );
      } catch {
        if (!mounted) return;
        setProjectFormFields(DEFAULT_PROJECT_FORM_FIELDS);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadProjects({ silent: true });
      }
    }, 30000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadProjects({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadProjects]);

  const categories = useMemo(() => {
    const map = new Map<string, ProjectCategory>();
    for (const p of projects) {
      if (p.category && !map.has(p.category.id)) map.set(p.category.id, p.category);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const statusFilters = useMemo(() => {
    const count = (s: string) => projects.filter((p) => p.status === s).length;
    return [
      { id: "all", label: "All Companies", Icon: FolderOpen, count: projects.length },
      { id: "active", label: "Active", Icon: CheckCircle2, count: count("active") },
      { id: "completed", label: "Completed", Icon: CheckSquare, count: count("completed") },
      { id: "archived", label: "Archived", Icon: Archive, count: count("archived") },
    ];
  }, [projects]);

  const categoryFilters = useMemo(
    () => [
      { id: "all", label: "All Categories", count: projects.length },
      ...categories.map((c) => ({ id: c.id, label: c.name, count: projects.filter((p) => p.category?.id === c.id).length })),
    ],
    [categories, projects]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      const matchesStatus = activeStatus === "all" || p.status === activeStatus;
      const matchesCategory = activeCategory === "all" || p.category?.id === activeCategory;
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesCategory && matchesSearch;
    });
  }, [projects, activeStatus, activeCategory, searchQuery]);

  function handleCreated(project: Project) {
    setProjects((prev) => [project, ...prev]);
  }

  function handleUpdated(project: Project) {
    setProjects((prev) => prev.map((p) => (p.id === project.id ? project : p)));
  }

  function handleDeleted(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (openProjectId === id) setOpenProjectId(null);
  }

  if (openProjectId) {
    return (
      <>
        <ProjectDetailView
          projectId={openProjectId}
          onBack={() => setOpenProjectId(null)}
          onEdit={(proj) => { setEditProject(proj); setEditOpen(true); }}
        />
        <ProjectFormDialog
          open={editOpen}
          onClose={() => { setEditOpen(false); setEditProject(null); }}
          onSaved={handleUpdated}
          onDeleted={handleDeleted}
          categories={categories}
          formFields={projectFormFields}
          existing={editProject ?? undefined}
          canManageProject={
            canManage ||
            (Boolean(currentUserId) &&
              Boolean(
                editProject?.members.some(
                  (member) => member.user.id === currentUserId && member.role === "manager"
                )
              ))
          }
        />
      </>
    );
  }

  return (
    <div className="flex h-full">
      {/* ── Left Panel ── */}
      <div className="w-56 border-r bg-white flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Companies</h2>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {statusFilters.map(({ id, label, Icon, count }) => {
            const isActive = activeStatus === id;
            return (
              <button
                key={id}
                onClick={() => setActiveStatus(id)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                  isActive ? "font-medium" : "text-gray-600 hover:bg-gray-100"
                )}
                style={isActive ? { backgroundColor: "#FFFAF0", color: "#AA8038" } : undefined}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4" />
                  {label}
                </div>
                <span
                  className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0", isActive ? "text-white" : "bg-gray-100 text-gray-500")}
                  style={isActive ? { backgroundColor: "#AA8038" } : undefined}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {categories.length > 0 && (
            <>
              <div className="my-2 border-t" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-1">Categories</p>
              {categoryFilters.map(({ id, label, count }) => {
                const isActive = activeCategory === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveCategory(id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                      isActive ? "font-medium" : "text-gray-600 hover:bg-gray-100"
                    )}
                    style={isActive ? { backgroundColor: "#FFFAF0", color: "#AA8038" } : undefined}
                  >
                    <span className="truncate">{label}</span>
                    <span
                      className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0", isActive ? "text-white" : "bg-gray-100 text-gray-500")}
                      style={isActive ? { backgroundColor: "#AA8038" } : undefined}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </nav>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b bg-white px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {canWrite && (
              <Button size="sm" style={{ backgroundColor: "#AA8038", color: "#fff" }} onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                New Company
              </Button>
            )}
            <span className="text-sm text-gray-400">{filtered.length} compan{filtered.length === 1 ? "y" : "ies"}</span>
            <div className="ml-2 inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 px-2 text-xs",
                  companyLayout === "grid" ? "bg-[#AA8038] text-white hover:bg-[#8f682d] hover:text-white" : "text-gray-500 hover:bg-gray-100"
                )}
                onClick={() => setCompanyLayout("grid")}
              >
                <Columns3 className="h-3.5 w-3.5 mr-1" />
                Grid
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 px-2 text-xs",
                  companyLayout === "list" ? "bg-[#AA8038] text-white hover:bg-[#8f682d] hover:text-white" : "text-gray-500 hover:bg-gray-100"
                )}
                onClick={() => setCompanyLayout("list")}
              >
                <List className="h-3.5 w-3.5 mr-1" />
                List
              </Button>
            </div>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search companies..."
              className="pl-8 h-8 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-52 rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-25" />
              <p className="text-sm font-medium">No companies found</p>
              {canWrite ? (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create your first company
                </Button>
              ) : null}
            </div>
          ) : companyLayout === "grid" ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={() => setOpenProjectId(project.id)}
                  onEdit={() => { setEditProject(project); setEditOpen(true); }}
                  canEditProject={
                    canWrite &&
                    (
                      canManage ||
                      (Boolean(currentUserId) &&
                        project.members.some(
                          (member) => member.user.id === currentUserId && member.role === "manager"
                        ))
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tasks</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((project) => {
                    const tasksCount = project.tasks?.length ?? project._count.tasks;
                    const doneTasks = (project.tasks ?? []).filter((task) =>
                      isTaskClosed(DEFAULT_PROJECT_TASK_STAGES, task.status)
                    ).length;
                    const canEditCompany =
                      canWrite &&
                      (
                        canManage ||
                        (Boolean(currentUserId) &&
                          project.members.some(
                            (member) =>
                              member.user.id === currentUserId && member.role === "manager"
                          ))
                      );

                    return (
                      <TableRow
                        key={project.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => setOpenProjectId(project.id)}
                      >
                        <TableCell>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">{project.name}</p>
                            {project.category ? (
                              <p className="text-xs text-slate-500">{project.category.name}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-xs",
                              STATUS_CONFIG[project.status]?.className ??
                                "bg-gray-100 text-gray-600"
                            )}
                          >
                            {STATUS_CONFIG[project.status]?.label ?? project.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">
                          {tasksCount > 0
                            ? `${doneTasks}/${tasksCount} done`
                            : "No tasks"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">
                          {project.members.length}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">
                          {project.endDate ? formatDate(project.endDate) : "No deadline"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenProjectId(project.id);
                              }}
                            >
                              Open
                            </Button>
                            {canEditCompany ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setEditProject(project);
                                  setEditOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <ProjectFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={handleCreated}
        categories={categories}
        formFields={projectFormFields}
      />
      <ProjectFormDialog
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditProject(null); }}
        onSaved={handleUpdated}
        onDeleted={handleDeleted}
        categories={categories}
        formFields={projectFormFields}
        existing={editProject ?? undefined}
        canManageProject={
          canManage ||
          (Boolean(currentUserId) &&
            Boolean(
              editProject?.members.some(
                (member) => member.user.id === currentUserId && member.role === "manager"
              )
            ))
        }
      />
    </div>
  );
}
