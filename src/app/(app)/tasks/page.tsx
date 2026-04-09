"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  RichTextEditor,
  hasRichTextContent,
  normalizeRichText,
} from "@/components/editor/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { buildThreadTree, type ThreadNode } from "@/lib/task-comment-thread";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Columns3,
  Eye,
  FilePlus2,
  Image,
  LayoutGrid,
  List,
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  Search,
  Send,
  Star,
  Trash2,
  User,
  X,
} from "lucide-react";

type TaskStatus = string;

type WorkflowStage = {
  key: string;
  label: string;
  color: string;
  isClosed: boolean;
  isDefault: boolean;
  order: number;
};

type TaskType = "task" | "event" | "note";
type TaskPriority = "low" | "normal" | "high";
type TaskView = "overview" | "personal" | "assigned" | "groups" | "all" | "filter";
type TaskCategory = "open" | "closed" | "events" | "notes" | "favorites" | "all";
type TaskLayout = "list" | "grid" | "kanban";

type TaskUser = { id: string; fullname: string; email?: string; groupIds?: string[] };
type TaskGroup = { id: string; name: string; color?: string };

type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  isPrivate: boolean;
  dueDate: string | null;
  createdAt: string;
  creatorId: string;
  creator: { id: string; name: string; fullname: string };
  assignees: Array<{
    id: string;
    userId?: string;
    canComment?: boolean;
    user: { id: string; name: string; fullname: string };
  }>;
  assignedGroups?: TaskGroup[];
  searchMatchText?: string | null;
  canComment?: boolean;
  canEditTask?: boolean;
  canChangeStatus?: boolean;
  canDelete?: boolean;
  conversationAuthorEditDeleteWindowMinutes?: number;
  isFavorite?: boolean;
};

type TaskComment = {
  id: string;
  parentCommentId: string | null;
  content: string;
  createdAt: string;
  user: { id: string; name: string; fullname: string };
  attachments: TaskAttachment[];
};

type TaskAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
};

type PendingFile = { id: string; file: File; previewUrl: string | null };

type TaskMetaResponse = {
  users: TaskUser[];
  groups: TaskGroup[];
  currentUserId: string;
};

type FilterState = {
  subject: string;
  periodFrom: string;
  periodTo: string;
  authorId: string;
  assigneeId: string;
};

type TaskFormState = {
  id?: string;
  title: string;
  assignees: Array<{ userId: string; canComment: boolean }>;
  groupIds: string[];
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  isPrivate: boolean;
  descriptionHtml: string;
};

const VIEW_TABS: Array<{ id: TaskView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal" },
  { id: "assigned", label: "Assigned" },
  { id: "groups", label: "Groups" },
  { id: "all", label: "All" },
  { id: "filter", label: "Filter" },
];

const CATEGORY_ITEMS: Array<{ id: TaskCategory; label: string }> = [
  { id: "open", label: "Open" },
  { id: "closed", label: "Completed" },
  { id: "events", label: "Events" },
  { id: "notes", label: "Notes" },
  { id: "favorites", label: "Favorites" },
  { id: "all", label: "All" },
];

const LAYOUT_ITEMS: Array<{ id: TaskLayout; label: string }> = [
  { id: "list", label: "List" },
  { id: "grid", label: "Grid" },
  { id: "kanban", label: "Kanban" },
];

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function getStageMeta(stages: WorkflowStage[], key: string) {
  const stage = stages.find((s) => s.key === key);
  const label = stage?.label ?? key
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
  const color = stage?.color ?? "#64748b";
  const { r, g, b } = hexToRgb(color.startsWith("#") && color.length === 7 ? color : "#64748b");
  return {
    label,
    color,
    badgeClass: `border-[${color}]/30 bg-[${color}]/10 text-[${color}]`,
    columnClass: `bg-[${color}]/5 border-[${color}]/20`,
    badgeStyle: { borderColor: `rgba(${r},${g},${b},0.3)`, backgroundColor: `rgba(${r},${g},${b},0.1)`, color: color },
    columnStyle: { backgroundColor: `rgba(${r},${g},${b},0.04)`, borderColor: `rgba(${r},${g},${b},0.2)` },
  };
}

const PRIORITY_META: Record<TaskPriority, string> = {
  high: "border-red-200 bg-red-100 text-red-700",
  normal: "border-amber-200 bg-amber-100 text-amber-700",
  low: "border-slate-200 bg-slate-100 text-slate-700",
};

const TYPE_META: Record<TaskType, string> = {
  task: "border-slate-200 bg-slate-100 text-slate-700",
  event: "border-blue-200 bg-blue-100 text-blue-700",
  note: "border-violet-200 bg-violet-100 text-violet-700",
};

const EMPTY_FILTERS: FilterState = {
  subject: "",
  periodFrom: "",
  periodTo: "",
  authorId: "",
  assigneeId: "",
};

const EMPTY_FORM: TaskFormState = {
  title: "",
  assignees: [],
  groupIds: [],
  type: "task",
  status: "opened",
  priority: "normal",
  dueDate: "",
  isPrivate: false,
  descriptionHtml: "",
};

function nameOf(user: { name: string; fullname: string }) {
  return user.fullname?.trim() || user.name || "Unknown";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString();
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString();
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageMime(mimeType: string) {
  return mimeType.startsWith("image/");
}

function toDateInput(value: string | null) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function toHtml(value: string | null) {
  if (!value) return "";
  if (/<[^>]+>/.test(value)) return value;
  return value.replace(/\n/g, "<br/>");
}

function toText(value: string | null) {
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

function buildParams(view: TaskView, category: TaskCategory, statusScope: string, search: string, filters: FilterState) {
  const params = new URLSearchParams();
  params.set("limit", "500");
  params.set("view", view);
  params.set("category", category);
  if (statusScope !== "all") params.set("status", statusScope);
  if (search.trim()) params.set("search", search.trim());

  if (view === "filter") {
    if (filters.subject.trim()) params.set("subject", filters.subject.trim());
    if (filters.periodFrom) params.set("periodFrom", filters.periodFrom);
    if (filters.periodTo) params.set("periodTo", filters.periodTo);
    if (filters.authorId) params.set("authorId", filters.authorId);
    if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  }

  return params;
}

function FilterPanel({
  value,
  onChange,
  users,
  onApply,
  onReset,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  users: TaskUser[];
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <div className="border-b border-neutral-300 bg-white px-6 py-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <div className="space-y-1">
          <Label className="text-xs text-slate-600">Subject</Label>
          <Input value={value.subject} onChange={(e) => onChange({ ...value, subject: e.target.value })} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-600">Period From</Label>
          <Input type="date" value={value.periodFrom} onChange={(e) => onChange({ ...value, periodFrom: e.target.value })} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-600">Period To</Label>
          <Input type="date" value={value.periodTo} onChange={(e) => onChange({ ...value, periodTo: e.target.value })} className="h-9" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={value.authorId || "all"} onValueChange={(v) => onChange({ ...value, authorId: v && v !== "all" ? v : "" })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Author" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All authors</SelectItem>
              {users.map((u) => <SelectItem key={`a-${u.id}`} value={u.id}>{u.fullname}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={value.assigneeId || "all"} onValueChange={(v) => onChange({ ...value, assigneeId: v && v !== "all" ? v : "" })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Assigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              {users.map((u) => <SelectItem key={`s-${u.id}`} value={u.id}>{u.fullname}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Button className="h-9 bg-[#AA8038] text-white hover:bg-[#D48A00]" onClick={onApply}>Filter</Button>
          <Button className="h-9" variant="outline" onClick={onReset}>Reset</Button>
        </div>
      </div>
    </div>
  );
}

function TaskModal({
  open,
  onClose,
  onSaved,
  users,
  groups,
  initial,
  stages,
  meId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  users: TaskUser[];
  groups: TaskGroup[];
  initial: TaskFormState;
  stages: WorkflowStage[];
  meId: string;
}) {
  const [form, setForm] = useState<TaskFormState>(initial);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  function ensureCreatorAssignee(next: TaskFormState): TaskFormState {
    // For new tasks, creator must stay assigned by default.
    if (next.id || !meId) return next;
    if (next.assignees.some((entry) => entry.userId === meId)) return next;
    return {
      ...next,
      assignees: [{ userId: meId, canComment: true }, ...next.assignees],
    };
  }

  useEffect(() => {
    if (!open) return;
    setForm(ensureCreatorAssignee(initial));
    setFiles([]);
  }, [open, initial, meId]);

  async function uploadFiles(taskId: string) {
    if (files.length === 0) return;
    const data = new FormData();
    for (const file of files) data.append("files", file);
    const response = await fetch(`/api/tasks/${taskId}/uploads`, { method: "POST", body: data });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Attachment upload failed");
    }
  }

  async function submit() {
    const preparedForm = ensureCreatorAssignee(form);
    if (!preparedForm.title.trim()) {
      toast.error("Subject is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: preparedForm.title.trim(),
        description: preparedForm.descriptionHtml,
        type: preparedForm.type,
        status: preparedForm.status,
        priority: preparedForm.priority,
        dueDate: preparedForm.dueDate || null,
        isPrivate: preparedForm.isPrivate,
        assignees: preparedForm.assignees,
        groupIds: preparedForm.groupIds,
      };

      const response = await fetch(form.id ? `/api/tasks/${form.id}` : "/api/tasks", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!response.ok || !data?.id) throw new Error(data?.error ?? "Save failed");

      await uploadFiles(data.id);
      toast.success(form.id ? "Task updated" : "Task created");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const selected = useMemo(() => new Set(form.assignees.map((entry) => entry.userId)), [form.assignees]);
  const selectedGroups = useMemo(() => new Set(form.groupIds), [form.groupIds]);
  const assigneeCanCommentMap = useMemo(
    () => new Map(form.assignees.map((entry) => [entry.userId, entry.canComment])),
    [form.assignees]
  );
  const groupedUsers = useMemo(() => {
    const sections = new Map<string, { group: TaskGroup; users: TaskUser[] }>();
    for (const group of groups) {
      sections.set(group.id, { group, users: [] });
    }
    const ungrouped: TaskUser[] = [];

    for (const user of users) {
      const groupId = (user.groupIds ?? []).find((id) => sections.has(id));
      if (groupId && sections.has(groupId)) {
        sections.get(groupId)?.users.push(user);
      } else {
        ungrouped.push(user);
      }
    }

    const result = Array.from(sections.values()).filter((section) => section.users.length > 0);
    if (ungrouped.length > 0) {
      result.push({
        group: { id: "ungrouped", name: "Ungrouped", color: "#94a3b8" },
        users: ungrouped,
      });
    }
    return result;
  }, [groups, users]);
  const titleIcon = form.id ? <Pencil className="h-5 w-5 text-[#AA8038]" /> : <FilePlus2 className="h-5 w-5 text-[#AA8038]" />;

  function toggleAssignee(userId: string, checked: boolean) {
    setForm((prev) => {
      if (!prev.id && userId === meId && !checked) return prev;
      if (checked) {
        if (prev.assignees.some((entry) => entry.userId === userId)) return prev;
        return {
          ...prev,
          assignees: [...prev.assignees, { userId, canComment: true }],
        };
      }
      return {
        ...prev,
        assignees: prev.assignees.filter((entry) => entry.userId !== userId),
      };
    });
  }

  function toggleAssigneeGroup(userIds: string[], checked: boolean) {
    setForm((prev) => {
      if (checked) {
        const next = [...prev.assignees];
        const existing = new Set(prev.assignees.map((entry) => entry.userId));
        for (const userId of userIds) {
          if (!existing.has(userId)) next.push({ userId, canComment: true });
        }
        return { ...prev, assignees: next };
      }
      return {
        ...prev,
        assignees: prev.assignees.filter((entry) => {
          if (!prev.id && entry.userId === meId) return true;
          return !userIds.includes(entry.userId);
        }),
      };
    });
  }

  function setAssigneeCommentAccess(userId: string, canComment: boolean) {
    setForm((prev) => ({
      ...prev,
      assignees: prev.assignees.map((entry) =>
        entry.userId === userId ? { ...entry, canComment } : entry
      ),
    }));
  }

  function toggleGroup(groupId: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      groupIds: checked
        ? Array.from(new Set([...prev.groupIds, groupId]))
        : prev.groupIds.filter((id) => id !== groupId),
    }));
  }

  function setDuePreset(daysFromToday: number) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() + daysFromToday);
    const value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setForm((prev) => ({ ...prev, dueDate: value }));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-[1180px]">
        <DialogHeader className="border-b bg-gradient-to-r from-slate-50 via-red-50 to-slate-50 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            {titleIcon}
            <span>{form.id ? "Edit Task" : "Create New Task"}</span>
          </DialogTitle>
          <DialogDescription>Subject, responsible users, status, deadline, rich text, and attachments.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden px-6 py-4 lg:grid-cols-[1fr_0.95fr]">
            <div className="space-y-4 overflow-auto pr-1">
            <div className="space-y-1.5">
              <Label>Subject *</Label>
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v as TaskType }))}>
                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>

              <Select value={form.status} onValueChange={(v) => { if (v) setForm((p) => ({ ...p, status: v })); }}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v as TaskPriority }))}>
                <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs text-slate-600"><CalendarDays className="h-3.5 w-3.5" />Deadline</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDuePreset(0)}>Today</Button>
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDuePreset(1)}>Tomorrow</Button>
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDuePreset(3)}>In 3 Days</Button>
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDuePreset(7)}>Next Week</Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-slate-500 hover:text-slate-700" onClick={() => setForm((p) => ({ ...p, dueDate: "" }))}>Clear</Button>
            </div>

            <RichTextEditor
              value={form.descriptionHtml}
              onChange={(next) => setForm((prev) => ({ ...prev, descriptionHtml: next }))}
              placeholder="Write task description..."
              minHeight={220}
              disabled={saving}
            />

            <div className="space-y-2">
              <Label>Attach file</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => document.getElementById("task-file-input")?.click()}>
                  <Paperclip className="mr-1 h-4 w-4" />Attach
                </Button>
                <input
                  id="task-file-input"
                  className="hidden"
                  type="file"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
                <span className="text-xs text-slate-500">{files.length > 0 ? `${files.length} file(s)` : "No files"}</span>
                {files.length > 0 ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-slate-500 hover:text-slate-700" onClick={() => setFiles([])}>
                    Clear files
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-3 overflow-auto rounded border bg-slate-50 p-3">
            <Label>Assigned to</Label>
            {groups.length > 0 ? (
              <div className="rounded border bg-white p-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Assign Groups
                </p>
                <div className="space-y-1.5">
                  {groups.map((group) => (
                    <label
                      key={`group-${group.id}`}
                      className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 hover:bg-slate-50"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-xs text-slate-700">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: group.color ?? "#94a3b8" }}
                        />
                        <span className="truncate">{group.name}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedGroups.has(group.id)}
                        onChange={(event) => toggleGroup(group.id, event.target.checked)}
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Group members are auto-added as assignees when saved.
                </p>
              </div>
            ) : null}
            <div className="max-h-72 space-y-1 overflow-y-auto rounded border bg-white p-2">
              {groupedUsers.length === 0 ? <p className="text-xs text-slate-500">No users available</p> : groupedUsers.map((section) => {
                const userIds = section.users.map((user) => user.id);
                const selectedCount = userIds.filter((id) => selected.has(id)).length;
                const allSelected = userIds.length > 0 && selectedCount === userIds.length;
                return (
                  <div key={section.group.id} className="rounded-md border bg-slate-50/50 p-2">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: section.group.color ?? "#94a3b8" }} />
                        <span className="truncate text-xs font-semibold uppercase tracking-wide text-slate-600">
                          {section.group.name}
                        </span>
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
                          {section.users.length}
                        </span>
                      </div>
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-slate-600">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(event) => toggleAssigneeGroup(userIds, event.target.checked)}
                        />
                        All
                      </label>
                    </div>
                    <div className="space-y-1">
                      {section.users.map((u) => {
                        const isCreate = !form.id;
                        const forceCreatorAssigned = isCreate && u.id === meId;
                        const isSelected = selected.has(u.id) || forceCreatorAssigned;
                        return (
                        <div key={u.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={forceCreatorAssigned}
                            onChange={(event) => toggleAssignee(u.id, event.target.checked)}
                          />
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="block truncate font-medium text-slate-800">{u.fullname}</span>
                            {u.email ? <span className="block truncate text-xs text-slate-500">{u.email}</span> : null}
                          </span>
                          {forceCreatorAssigned ? (
                            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              Creator
                            </span>
                          ) : null}
                          {isSelected ? (
                            <Select
                              value={assigneeCanCommentMap.get(u.id) === false ? "view" : "comment"}
                              onValueChange={(value) => setAssigneeCommentAccess(u.id, value !== "view")}
                            >
                              <SelectTrigger className="h-8 w-[132px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="comment">Can Comment</SelectItem>
                                <SelectItem value="view">View Only</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : null}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="rounded border bg-white px-3 py-2 text-xs text-slate-600">
              Assignee comment access is controlled per person.
            </p>
            {!form.id ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Creator is auto-assigned and cannot be removed while creating a task.
              </p>
            ) : null}
            <label className="flex items-center gap-2 rounded border bg-white px-3 py-2 text-sm">
              <input type="checkbox" checked={form.isPrivate} onChange={(e) => setForm((p) => ({ ...p, isPrivate: e.target.checked }))} />
              Private task
            </label>
          </div>
          </div>

          <DialogFooter className="border-t px-6 py-3">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button className="bg-[#AA8038] text-white hover:bg-[#D48A00]" onClick={() => void submit()} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-1 h-4 w-4" />}
              {form.id ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaskDetailDialog({
  open,
  onClose,
  task,
  stages,
  meId,
}: {
  open: boolean;
  onClose: () => void;
  task: TaskItem | null;
  stages: WorkflowStage[];
  meId: string;
}) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentHtml, setEditingCommentHtml] = useState("");
  const [replyToComment, setReplyToComment] = useState<TaskComment | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [collapsedReplies, setCollapsedReplies] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { can } = usePermissions();

  useEffect(() => {
    if (!open || !task) return;
    setComments([]);
    setCommentText("");
    setPendingFiles([]);
    setEditingCommentId(null);
    setEditingCommentHtml("");
    setReplyToComment(null);
    setLoadingComments(true);
    fetch(`/api/tasks/${task.id}/comments`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setComments(data as TaskComment[]);
        else if (data && typeof data === "object" && "comments" in data) setComments((data as { comments: TaskComment[] }).comments ?? []);
      })
      .catch(() => toast.error("Failed to load comments"))
      .finally(() => setLoadingComments(false));
  }, [open, task]);

  useEffect(() => {
    if (comments.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const nextPending: PendingFile[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      previewUrl: isImageMime(file.type) ? URL.createObjectURL(file) : null,
    }));
    setPendingFiles((prev) => [...prev, ...nextPending]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePending(id: string) {
    setPendingFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  async function uploadFiles(commentId: string): Promise<boolean> {
    if (!task || pendingFiles.length === 0) return true;
    setUploading(true);
    try {
      const data = new FormData();
      data.append("commentId", commentId);
      for (const item of pendingFiles) data.append("files", item.file);
      const response = await fetch(`/api/tasks/${task.id}/uploads`, {
        method: "POST",
        body: data,
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Attachment upload failed");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Attachment upload failed");
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function postComment() {
    const normalizedContent = normalizeRichText(commentText);
    const hasText = hasRichTextContent(normalizedContent);
    const hasFiles = pendingFiles.length > 0;
    if (!task || (!hasText && !hasFiles)) return;
    if (!canComment) {
      toast.error("You can view this task, but commenting is disabled for your assignment");
      return;
    }
    const content = normalizedContent;
    setPosting(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          allowEmpty: hasFiles,
          parentCommentId: replyToComment?.id ?? null,
        }),
      });
      const data = (await response.json().catch(() => null)) as TaskComment | { error?: string } | null;
      if (!response.ok || !data || "error" in data) throw new Error((data as { error?: string } | null)?.error ?? "Failed to post comment");

      const created = data as TaskComment;
      if (hasFiles) {
        const ok = await uploadFiles(created.id);
        if (!ok) {
          setPosting(false);
          return;
        }
      }

      const refreshed = await fetch(`/api/tasks/${task.id}/comments`, { cache: "no-store" });
      const refreshedData = (await refreshed.json().catch(() => null)) as TaskComment[] | { comments?: TaskComment[] } | null;
      if (Array.isArray(refreshedData)) {
        setComments(refreshedData);
      } else if (refreshedData?.comments && Array.isArray(refreshedData.comments)) {
        setComments(refreshedData.comments);
      } else {
        setComments((prev) => [...prev, created]);
      }

      setCommentText("");
      setPendingFiles([]);
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
      const response = await fetch(`/api/tasks/${task.id}/comments/${editingCommentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await response.json().catch(() => null)) as TaskComment | { error?: string } | null;
      if (!response.ok || !data || "error" in data) {
        throw new Error((data as { error?: string } | null)?.error ?? "Failed to update comment");
      }
      const updated = data as TaskComment;
      setComments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
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
    if (!task || deletingCommentId) return;
    const confirmed = window.confirm("Delete this conversation message?");
    if (!confirmed) return;
    setDeletingCommentId(commentId);
    try {
      const response = await fetch(`/api/tasks/${task.id}/comments/${commentId}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to delete comment");
      }

      const refreshed = await fetch(`/api/tasks/${task.id}/comments`, { cache: "no-store" });
      const refreshedData = (await refreshed.json().catch(() => null)) as
        | TaskComment[]
        | { comments?: TaskComment[] }
        | null;
      if (Array.isArray(refreshedData)) {
        setComments(refreshedData);
      } else if (refreshedData?.comments && Array.isArray(refreshedData.comments)) {
        setComments(refreshedData.comments);
      } else {
        setComments((prev) => prev.filter((item) => item.id !== commentId));
      }

      if (editingCommentId === commentId) {
        setEditingCommentId(null);
        setEditingCommentHtml("");
      }
      if (replyToComment?.id === commentId) {
        setReplyToComment(null);
      }
      toast.success("Conversation message deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete comment");
    } finally {
      setDeletingCommentId(null);
    }
  }

  const commentTree = useMemo(() => buildThreadTree(comments), [comments]);
  const threadMeta = useMemo(() => {
    const meta: Record<string, { descendants: number; depth: number }> = {};
    const walk = (node: ThreadNode<TaskComment>) => {
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
    setCollapsedReplies(autoCollapsedReplies);
  }, [autoCollapsedReplies]);

  if (!task) return null;
  const stageMeta = getStageMeta(stages, task.status);
  const isClosed = stages.find((s) => s.key === task.status)?.isClosed ?? false;
  const canEditConversation = task.type === "note";
  const canManage = can("tasks", "manage");
  const conversationAuthorEditDeleteWindowMinutes =
    task.conversationAuthorEditDeleteWindowMinutes ?? 5;
  const canComment =
    task.canComment ??
    (canManage ||
      task.assignees.some(
        (entry) => entry.user.id === meId && (entry.canComment ?? true)
      ));

  const renderCommentNode = (comment: ThreadNode<TaskComment>, depth: number): ReactNode => {
    const isMe = comment.user.id === meId;
    const isWithinAuthorWindow = isWithinCommentWindow(
      comment.createdAt,
      conversationAuthorEditDeleteWindowMinutes
    );
    const canEditComment =
      canEditConversation && (canManage || (isMe && isWithinAuthorWindow));
    const canDeleteComment = canEditComment;
    const isEditing = editingCommentId === comment.id;
    const depthOffset = Math.min(depth, 6) * 14;
    const replyMeta = threadMeta[comment.id] ?? { descendants: 0, depth: 1 };
    const hasReplies = comment.replies.length > 0;
    const isRepliesCollapsed = collapsedReplies[comment.id] ?? false;

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
              {(comment.user.fullname || comment.user.name || "?")[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2 text-[11px] text-slate-500">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">{comment.user.fullname || comment.user.name}</span>
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
                  {canEditComment && !isEditing ? (
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
                  {canDeleteComment && !isEditing ? (
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
                      {savingEdit ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {hasRichTextContent(comment.content) ? (
                    <div
                      className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800"
                      dangerouslySetInnerHTML={{ __html: normalizeRichText(toHtml(comment.content)) }}
                    />
                  ) : null}
                  {comment.attachments.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                      {comment.attachments.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={attachment.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border bg-white px-2.5 py-2 text-xs hover:bg-slate-50"
                        >
                          {isImageMime(attachment.mimeType) ? (
                            <Image className="h-4 w-4 shrink-0 text-blue-500" />
                          ) : (
                            <FilePlus2 className="h-4 w-4 shrink-0 text-slate-400" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-700">{attachment.fileName}</p>
                            <p className="text-slate-400">{formatFileSize(attachment.fileSize)}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </>
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
                    {replyMeta.descendants} repl{replyMeta.descendants === 1 ? "y" : "ies"} in this branch
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {hasReplies && !isRepliesCollapsed ? (
          <div className="ml-4 space-y-2 border-l-2 border-[#AA8038]/25 pl-4">
            {comment.replies.map((child) => renderCommentNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b bg-gradient-to-r from-slate-50 via-red-50 to-slate-50 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg leading-tight">
            <MessageSquare className="h-5 w-5 shrink-0 text-[#AA8038]" />
            <span className={cn("line-clamp-2", isClosed && "line-through text-slate-400")}>{task.title}</span>
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="outline" style={stageMeta.badgeStyle} className="h-5 px-1.5 text-[10px]">{stageMeta.label}</Badge>
            <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", PRIORITY_META[task.priority])}>{task.priority}</Badge>
            <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", TYPE_META[task.type])}>{task.type}</Badge>
            {task.dueDate ? (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <CalendarDays className="h-3 w-3" />{formatDate(task.dueDate)}
              </span>
            ) : null}
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Task details */}
          <div className="shrink-0 space-y-3 border-b bg-white px-6 py-4 text-sm">
            <div className="flex flex-wrap gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1"><User className="h-3.5 w-3.5 text-slate-400" />Author: <span className="font-medium text-slate-800">{nameOf(task.creator)}</span></span>
              <span className="flex items-center gap-1">Assigned: <span className="font-medium text-slate-800">{task.assignees.length > 0 ? task.assignees.map((e) => nameOf(e.user)).join(", ") : "—"}</span></span>
              {Array.isArray(task.assignedGroups) && task.assignedGroups.length > 0 ? (
                <span className="flex items-center gap-1">
                  Groups:
                  <span className="font-medium text-slate-800">
                    {task.assignedGroups.map((group) => group.name).join(", ")}
                  </span>
                </span>
              ) : null}
              <span>Created: <span className="font-medium text-slate-800">{formatDateTime(task.createdAt)}</span></span>
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

          {/* Comments */}
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

          {/* Comment input */}
          <div className="shrink-0 border-t bg-white px-6 py-3">
            <div className="space-y-2">
              {replyToComment ? (
                <div className="flex items-start justify-between gap-2 rounded-lg border border-[#AA8038]/30 bg-[#AA8038]/10 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#8A651E]">Replying to {nameOf(replyToComment.user)}</p>
                    <p className="truncate text-[#8A651E]/90">{toText(replyToComment.content) || "Attachment"}</p>
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
                  You can view this task, but commenting is disabled for your assignment.
                </div>
              ) : null}
              {pendingFiles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {pendingFiles.map((item) => (
                    <div key={item.id} className="relative flex items-center gap-2 rounded-lg border bg-slate-50 px-2.5 py-2 text-xs">
                      {item.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.previewUrl} alt={item.file.name} className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <FilePlus2 className="h-4 w-4 text-slate-400" />
                      )}
                      <div className="min-w-0">
                        <p className="max-w-[140px] truncate font-medium text-slate-700">{item.file.name}</p>
                        <p className="text-slate-400">{formatFileSize(item.file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePending(item.id)}
                        className="ml-1 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        disabled={posting || uploading}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <RichTextEditor
                value={commentText}
                onChange={setCommentText}
                placeholder="Write a comment..."
                minHeight={110}
                disabled={posting || uploading || !canComment}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={posting || uploading || !canComment}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  className="h-10 bg-[#AA8038] text-white hover:bg-[#D48A00]"
                  size="icon"
                  onClick={() => void postComment()}
                  disabled={posting || uploading || !canComment || (!hasRichTextContent(commentText) && pendingFiles.length === 0)}
                >
                  {posting || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={pickFile}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TasksPage() {
  const { can } = usePermissions();
  const canWrite = can("tasks", "write");
  const canManage = can("tasks", "manage");
  const router = useRouter();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [countTasks, setCountTasks] = useState<TaskItem[]>([]);
  const [stages, setStages] = useState<WorkflowStage[]>([
    { key: "opened", label: "Open", color: "#22c55e", isClosed: false, isDefault: true, order: 0 },
    { key: "completed", label: "Completed", color: "#3b82f6", isClosed: true, isDefault: false, order: 1 },
    { key: "closed", label: "Closed", color: "#64748b", isClosed: true, isDefault: false, order: 2 },
  ]);
  const [users, setUsers] = useState<TaskUser[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [meId, setMeId] = useState("");
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<TaskView>("overview");
  const [layout, setLayout] = useState<TaskLayout>("list");
  const [category, setCategory] = useState<TaskCategory>("all");
  const [statusScope, setStatusScope] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [filterDraft, setFilterDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [filterApplied, setFilterApplied] = useState<FilterState>(EMPTY_FILTERS);

  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<TaskFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<TaskItem | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const [refreshToken, setRefreshToken] = useState(0);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const dragPreviewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 220);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const loadMeta = useCallback(async () => {
    try {
      const response = await fetch("/api/tasks/meta", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as TaskMetaResponse;
      setUsers(data.users ?? []);
      setGroups(data.groups ?? []);
      setMeId(data.currentUserId ?? "");
    } catch {
      toast.error("Failed to load task metadata");
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const listParams = buildParams(view, category, statusScope, search, filterApplied);
      const countParams = buildParams(view, "all", "all", "", filterApplied);

      const [listResponse, countResponse] = await Promise.all([
        fetch(`/api/tasks?${listParams.toString()}`, { cache: "no-store" }),
        fetch(`/api/tasks?${countParams.toString()}`, { cache: "no-store" }),
      ]);

      if (!listResponse.ok) {
        const payload = (await listResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to load tasks");
      }
      if (!countResponse.ok) {
        const payload = (await countResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to load task counters");
      }

      const listData = (await listResponse.json()) as { items: TaskItem[]; stages: WorkflowStage[] } | TaskItem[];
      const countData = (await countResponse.json()) as { items: TaskItem[]; stages: WorkflowStage[] } | TaskItem[];

      if (Array.isArray(listData)) {
        setTasks(listData);
      } else {
        setTasks(Array.isArray(listData.items) ? listData.items : []);
        if (Array.isArray(listData.stages) && listData.stages.length > 0) setStages(listData.stages);
      }

      if (Array.isArray(countData)) {
        setCountTasks(countData);
      } else {
        setCountTasks(Array.isArray(countData.items) ? countData.items : []);
        if (Array.isArray(countData.stages) && countData.stages.length > 0) setStages(countData.stages);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [category, filterApplied, search, statusScope, view]);

  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => { void loadTasks(); }, [loadTasks, refreshToken]);
  useEffect(() => () => {
    const preview = dragPreviewRef.current;
    if (preview?.parentNode) preview.parentNode.removeChild(preview);
    dragPreviewRef.current = null;
  }, []);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of CATEGORY_ITEMS) map.set(item.id, 0);
    const openKeys = new Set(stages.filter((s) => !s.isClosed).map((s) => s.key));
    const closedKeys = new Set(stages.filter((s) => s.isClosed).map((s) => s.key));
    for (const task of countTasks) {
      map.set("all", (map.get("all") ?? 0) + 1);
      if (openKeys.has(task.status)) map.set("open", (map.get("open") ?? 0) + 1);
      if (closedKeys.has(task.status)) map.set("closed", (map.get("closed") ?? 0) + 1);
      if (task.type === "event") map.set("events", (map.get("events") ?? 0) + 1);
      if (task.type === "note") map.set("notes", (map.get("notes") ?? 0) + 1);
      if (task.isFavorite) map.set("favorites", (map.get("favorites") ?? 0) + 1);
    }
    return map;
  }, [countTasks, stages]);

  const tasksByStatus = useMemo(() => {
    const buckets: Record<string, TaskItem[]> = {};
    for (const stage of stages) buckets[stage.key] = [];
    for (const task of tasks) {
      if (buckets[task.status]) {
        buckets[task.status].push(task);
      } else {
        // Unknown status — put in first bucket
        const firstKey = stages[0]?.key;
        if (firstKey) buckets[firstKey] = [...(buckets[firstKey] ?? []), task];
      }
    }
    return buckets;
  }, [tasks, stages]);

  function openCreate() {
    if (!canWrite) return;
    setFormInitial(EMPTY_FORM);
    setFormOpen(true);
  }

  async function openEdit(task: TaskItem) {
    if (!(task.canEditTask ?? canWrite)) return;
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as TaskItem | { error?: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error((payload as { error?: string } | null)?.error ?? "Failed to load task details");
      }
      const detailedTask = payload as TaskItem;
      setFormInitial({
        id: detailedTask.id,
        title: detailedTask.title,
        assignees: detailedTask.assignees.map((entry) => ({
          userId: entry.user.id,
          canComment: entry.canComment ?? true,
        })),
        groupIds: Array.isArray(detailedTask.assignedGroups)
          ? detailedTask.assignedGroups.map((group) => group.id).filter(Boolean)
          : [],
        type: detailedTask.type,
        status: detailedTask.status,
        priority: detailedTask.priority,
        dueDate: toDateInput(detailedTask.dueDate),
        isPrivate: detailedTask.isPrivate,
        descriptionHtml: toHtml(detailedTask.description),
      });
      setFormOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open task editor");
    }
  }

  function openDetail(task: TaskItem) {
    router.push(`/tasks/${task.id}`);
  }

  async function patchTask(id: string, payload: Record<string, unknown>) {
    if (!canWrite) {
      throw new Error("Forbidden: missing tasks.write permission");
    }
    const response = await fetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => null)) as TaskItem | { error?: string } | null;
    if (!response.ok || !data || "error" in data) {
      throw new Error((data as { error?: string } | null)?.error ?? "Task update failed");
    }
    const updatedTask = data as TaskItem;
    setTasks((prev) => prev.map((task) => (task.id === id ? updatedTask : task)));
    setCountTasks((prev) => prev.map((task) => (task.id === id ? updatedTask : task)));
  }

  async function toggleComplete(task: TaskItem) {
    const canChangeStatus = task.canChangeStatus ?? (task.canEditTask ?? canWrite);
    if (!canChangeStatus) {
      toast.error("You do not have permission to change task status");
      return;
    }
    try {
      const openStage = stages.find((s) => !s.isClosed);
      const closedStage = stages.find((s) => s.isClosed);
      const currentStage = stages.find((s) => s.key === task.status);
      const nextStatus = currentStage?.isClosed ? (openStage?.key ?? "opened") : (closedStage?.key ?? "completed");
      await patchTask(task.id, { status: nextStatus });
      toast.success(currentStage?.isClosed ? "Task reopened" : "Task completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Task update failed");
    }
  }

  async function moveTaskToStatus(task: TaskItem, status: string) {
    if (task.status === status) return;
    const canChangeStatus = task.canChangeStatus ?? (task.canEditTask ?? canWrite);
    if (!canChangeStatus) {
      toast.error("You do not have permission to change task status");
      return;
    }
    try {
      const stageMeta = getStageMeta(stages, status);
      await patchTask(task.id, { status });
      toast.success(`Task moved to ${stageMeta.label.toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Task update failed");
    }
  }

  function cleanupDragPreview() {
    const preview = dragPreviewRef.current;
    if (preview?.parentNode) {
      preview.parentNode.removeChild(preview);
    }
    dragPreviewRef.current = null;
  }

  function handleKanbanDragStart(event: DragEvent<HTMLElement>, taskId: string) {
    setDragTaskId(taskId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);

    cleanupDragPreview();
    const source = event.currentTarget;
    const clone = source.cloneNode(true) as HTMLDivElement;
    clone.style.position = "fixed";
    clone.style.top = "-1000px";
    clone.style.left = "-1000px";
    clone.style.margin = "0";
    clone.style.width = `${source.clientWidth}px`;
    clone.style.maxWidth = `${source.clientWidth}px`;
    clone.style.pointerEvents = "none";
    clone.style.opacity = "0.92";
    clone.style.transform = "scale(0.98)";
    clone.style.boxShadow = "0 12px 32px rgba(15, 23, 42, 0.22)";
    clone.style.zIndex = "9999";
    document.body.appendChild(clone);
    dragPreviewRef.current = clone;
    event.dataTransfer.setDragImage(clone, 18, 18);
  }

  function handleKanbanDragEnd() {
    setDragTaskId(null);
    cleanupDragPreview();
  }

  async function toggleFavorite(task: TaskItem) {
    try {
      const response = await fetch(`/api/tasks/${task.id}/favorite`, { method: task.isFavorite ? "DELETE" : "POST" });
      const data = (await response.json().catch(() => null)) as { isFavorite: boolean; favoriteCount: number; error?: string } | null;
      if (!response.ok || !data) throw new Error(data?.error ?? "Favorite update failed");
      setTasks((prev) => prev.map((entry) => entry.id === task.id ? { ...entry, isFavorite: data.isFavorite } : entry));
      setCountTasks((prev) => prev.map((entry) => entry.id === task.id ? { ...entry, isFavorite: data.isFavorite } : entry));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Favorite update failed");
    }
  }

  async function removeTask(task: TaskItem) {
    if (!canManage) {
      toast.error("You don't have permission to delete tasks");
      return;
    }
    setDeletingTaskId(task.id);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Delete failed");
      }
      setTasks((prev) => prev.filter((entry) => entry.id !== task.id));
      setCountTasks((prev) => prev.filter((entry) => entry.id !== task.id));
      setDeleteTarget(null);
      toast.success("Task deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeletingTaskId(null);
    }
  }

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r bg-white">
        <div className="border-b p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">Tasks</h2>
        </div>
        <nav className="h-[calc(100%-57px)] space-y-0.5 overflow-y-auto p-2">
          {CATEGORY_ITEMS.map((item) => {
            const active = category === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCategory(item.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "font-medium text-[#AA8038]" : "text-gray-600 hover:bg-gray-100"
                )}
                style={active ? { backgroundColor: "#FFFAF0" } : undefined}
              >
                <span>{item.label}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium",
                    active ? "text-white" : "bg-gray-100 text-gray-500"
                  )}
                  style={active ? { backgroundColor: "#AA8038" } : undefined}
                >
                  {counts.get(item.id) ?? 0}
                </span>
              </button>
            );
          })}

          <div className="my-2 border-t" />
          <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Scope</p>
          {VIEW_TABS.map((tab) => {
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setView(tab.id);
                  if (tab.id !== "filter") {
                    setFilterDraft(EMPTY_FILTERS);
                    setFilterApplied(EMPTY_FILTERS);
                  }
                }}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                  active ? "font-medium text-[#AA8038]" : "text-gray-600 hover:bg-gray-100"
                )}
                style={active ? { backgroundColor: "#FFFAF0" } : undefined}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b bg-white px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {canWrite ? (
                <Button className="h-8 bg-[#AA8038] text-xs text-white hover:bg-[#D48A00]" onClick={openCreate}>
                  <Plus className="mr-1 h-4 w-4" />
                  New Task
                </Button>
              ) : null}
              <span className="text-sm text-gray-500">
                {tasks.length} task{tasks.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search tasks..."
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <button
                className="flex h-8 w-8 items-center justify-center rounded border bg-white hover:bg-slate-50"
                onClick={() => setRefreshToken((prev) => prev + 1)}
                title="Refresh"
              >
                <Loader2 className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </button>
            </div>
          </div>
        </div>

        <div className="border-b bg-white px-6 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border bg-white p-1">
              {LAYOUT_ITEMS.map((item) => {
                const active = layout === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setLayout(item.id)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded px-2.5 text-xs",
                      active ? "bg-[#AA8038] text-white" : "text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {item.id === "list" ? <List className="h-3.5 w-3.5" /> : null}
                    {item.id === "grid" ? <LayoutGrid className="h-3.5 w-3.5" /> : null}
                    {item.id === "kanban" ? <Columns3 className="h-3.5 w-3.5" /> : null}
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div className="ml-auto min-w-44">
              <Select value={statusScope} onValueChange={(value) => setStatusScope(value ?? "all")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {view === "filter" ? (
          <FilterPanel
            value={filterDraft}
            onChange={setFilterDraft}
            users={users}
            onApply={() => {
              setFilterApplied(filterDraft);
              setRefreshToken((p) => p + 1);
            }}
            onReset={() => {
              setFilterDraft(EMPTY_FILTERS);
              setFilterApplied(EMPTY_FILTERS);
              setRefreshToken((p) => p + 1);
            }}
          />
        ) : null}

        <section className="flex-1 overflow-auto bg-gray-50 p-4">
          {loading ? (
            layout === "list" ? (
              <div className="space-y-2">{Array.from({ length: 10 }).map((_, idx) => <Skeleton key={idx} className="h-11 w-full" />)}</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => <Skeleton key={idx} className="h-44 w-full rounded-xl" />)}
              </div>
            )
          ) : tasks.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
              <CheckCircle2 className="h-14 w-14 opacity-30" />
              <p className="mt-3 text-sm">No tasks found.</p>
            </div>
          ) : layout === "list" ? (
            <div className="min-w-[1080px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[44px_1.8fr_130px_160px_160px_170px_170px] border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <span className="text-center">#</span>
                <span>Subject</span>
                <span>Status</span>
                <span>Due</span>
                <span>Created</span>
                <span>Responsible</span>
                <span className="text-right">Actions</span>
              </div>
              {tasks.map((task) => {
                const done = stages.find((s) => s.key === task.status)?.isClosed ?? false;
                const canEditTaskItem = task.canEditTask ?? canWrite;
                const canChangeStatus = task.canChangeStatus ?? canEditTaskItem;
                const canDeleteTaskItem = task.canDelete ?? canManage;
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "grid grid-cols-[44px_1.8fr_130px_160px_160px_170px_170px] items-center border-b border-slate-200 px-3 py-2 text-xs",
                      done ? "bg-red-50/30" : "bg-white hover:bg-slate-50"
                    )}
                  >
                    <button
                      className="mx-auto flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-slate-500 hover:border-[#AA8038] hover:text-[#AA8038]"
                      onClick={() => void toggleComplete(task)}
                      title={done ? "Reopen" : "Complete"}
                      disabled={!canChangeStatus}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : null}
                    </button>

                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          className={cn("truncate text-left font-semibold text-slate-800 hover:text-[#AA8038] hover:underline", done && "line-through text-slate-500")}
                          onClick={() => openDetail(task)}
                          title="View details & comments"
                        >{task.title}</button>
                        <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", PRIORITY_META[task.priority])}>{task.priority}</Badge>
                        <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", TYPE_META[task.type])}>{task.type}</Badge>
                      </div>
                      {task.searchMatchText || task.description ? (
                        <p className="truncate text-xs text-slate-500">
                          {task.searchMatchText
                            ? `Match: ${toText(task.searchMatchText)}`
                            : toText(task.description)}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <Badge variant="outline" style={getStageMeta(stages, task.status).badgeStyle} className="h-5 px-1.5 text-[10px]">
                        {getStageMeta(stages, task.status).label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-600">
                      <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                      {formatDate(task.dueDate)}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-600">
                      <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                      {formatDateTime(task.createdAt)}
                    </div>
                    <div className="truncate text-xs text-slate-700">
                      {task.assignees.length > 0 ? task.assignees.map((entry) => nameOf(entry.user)).join(", ") : "-"}
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className={cn(
                          "rounded border p-1",
                          task.isFavorite ? "border-amber-300 bg-amber-50 text-amber-600" : "border-transparent text-slate-400 hover:border-slate-200 hover:text-slate-600"
                        )}
                        onClick={() => void toggleFavorite(task)}
                        title="Favorite"
                      >
                        <Star className={cn("h-3.5 w-3.5", task.isFavorite && "fill-current")} />
                      </button>
                      <button
                        className="rounded border border-transparent p-1 text-slate-400 hover:border-slate-200 hover:text-slate-600"
                        onClick={() => void openEdit(task)}
                        title="Edit"
                        disabled={!canEditTaskItem}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="rounded border border-transparent p-1 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setDeleteTarget(task)}
                        title="Delete"
                        disabled={!canDeleteTaskItem || deletingTaskId === task.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : layout === "grid" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tasks.map((task) => {
                const canEditTaskItem = task.canEditTask ?? canWrite;
                const canChangeStatus = task.canChangeStatus ?? canEditTaskItem;
                const canDeleteTaskItem = task.canDelete ?? canManage;
                return (
                <article key={task.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      className={cn("line-clamp-2 text-left text-sm font-semibold text-slate-900 hover:text-[#AA8038] hover:underline", (stages.find((s) => s.key === task.status)?.isClosed ?? false) && "line-through text-slate-500")}
                      onClick={() => openDetail(task)}
                      title="View details & comments"
                    >
                      {task.title}
                    </button>
                    <button
                      className="rounded border border-slate-200 p-1 text-slate-500 hover:border-[#AA8038] hover:text-[#AA8038]"
                      onClick={() => void toggleComplete(task)}
                      disabled={!canChangeStatus}
                      title={(stages.find((s) => s.key === task.status)?.isClosed ?? false) ? "Reopen" : "Mark complete"}
                    >
                      {(stages.find((s) => s.key === task.status)?.isClosed ?? false) ? <Eye className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" style={getStageMeta(stages, task.status).badgeStyle} className="h-5 px-1.5 text-[10px]">{getStageMeta(stages, task.status).label}</Badge>
                    <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", PRIORITY_META[task.priority])}>{task.priority}</Badge>
                    <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", TYPE_META[task.type])}>{task.type}</Badge>
                  </div>

                  <p className="mt-2 line-clamp-3 min-h-[3.5rem] text-xs text-slate-600">
                    {task.searchMatchText
                      ? `Match: ${toText(task.searchMatchText)}`
                      : toText(task.description) || "No description"}
                  </p>

                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                      Due: {formatDate(task.dueDate)}
                    </div>
                    <div className="truncate">Assigned: {task.assignees.length > 0 ? task.assignees.map((entry) => nameOf(entry.user)).join(", ") : "-"}</div>
                    {Array.isArray(task.assignedGroups) && task.assignedGroups.length > 0 ? (
                      <div className="truncate">Groups: {task.assignedGroups.map((group) => group.name).join(", ")}</div>
                    ) : null}
                    <div className="truncate text-[#0066c2]">Author: {nameOf(task.creator)}</div>
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-1">
                    <button
                      className={cn(
                        "rounded border p-1",
                        task.isFavorite ? "border-amber-300 bg-amber-50 text-amber-600" : "border-transparent text-slate-400 hover:border-slate-200 hover:text-slate-600"
                      )}
                      onClick={() => void toggleFavorite(task)}
                      title="Favorite"
                    >
                      <Star className={cn("h-3.5 w-3.5", task.isFavorite && "fill-current")} />
                    </button>
                    <button
                      className="rounded border border-transparent p-1 text-slate-400 hover:border-slate-200 hover:text-slate-600"
                      onClick={() => void openEdit(task)}
                      title="Edit"
                      disabled={!canEditTaskItem}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="rounded border border-transparent p-1 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      onClick={() => setDeleteTarget(task)}
                      title="Delete"
                      disabled={!canDeleteTaskItem || deletingTaskId === task.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              );})}
            </div>
          ) : (
            <div className="min-w-[1024px]">
              <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${Math.min(stages.length, 4)}, minmax(0, 1fr))` }}>
                {stages.map((stage) => {
                  const meta = getStageMeta(stages, stage.key);
                  return (
                    <div
                      key={stage.key}
                      className="flex h-[calc(100vh-290px)] min-h-[420px] flex-col rounded-xl border"
                      style={meta.columnStyle}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (!dragTaskId) return;
                        const draggedTask = tasks.find((entry) => entry.id === dragTaskId);
                        setDragTaskId(null);
                        if (!draggedTask) return;
                        const canChangeStatus = draggedTask.canChangeStatus ?? (draggedTask.canEditTask ?? canWrite);
                        if (!canChangeStatus) return;
                        void moveTaskToStatus(draggedTask, stage.key);
                      }}
                    >
                      <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: meta.columnStyle.borderColor }}>
                        <p className="text-sm font-semibold text-slate-700">{stage.label}</p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                          {(tasksByStatus[stage.key] ?? []).length}
                        </span>
                      </div>
                      <div className="flex-1 space-y-2 overflow-y-auto p-3">
                        {(tasksByStatus[stage.key] ?? []).length === 0 ? (
                          <p className="rounded-md border border-dashed border-slate-300 bg-white/40 p-3 text-xs text-slate-500">
                            No tasks in this column.
                          </p>
                        ) : (
                          (tasksByStatus[stage.key] ?? []).map((task) => (
                            <article
                              key={task.id}
                              draggable={task.canChangeStatus ?? (task.canEditTask ?? canWrite)}
                              onDragStart={(event) => handleKanbanDragStart(event, task.id)}
                              onDragEnd={handleKanbanDragEnd}
                              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                            >
                              <button
                                className={cn("line-clamp-2 w-full text-left text-sm font-semibold text-slate-900 hover:text-[#AA8038] hover:underline", stage.isClosed && "line-through text-slate-500")}
                                onClick={() => openDetail(task)}
                                title="View details & comments"
                              >
                                {task.title}
                              </button>
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", PRIORITY_META[task.priority as TaskPriority])}>{task.priority}</Badge>
                                <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", TYPE_META[task.type as TaskType])}>{task.type}</Badge>
                              </div>
                              <p className="mt-2 line-clamp-2 text-xs text-slate-600">
                                {task.searchMatchText
                                  ? `Match: ${toText(task.searchMatchText)}`
                                  : toText(task.description) || "No description"}
                              </p>
                              <div className="mt-2 text-xs text-slate-500">Due: {formatDate(task.dueDate)}</div>

                              <div className="mt-3 flex items-center justify-between gap-2">
                                <Select
                                  value={task.status}
                                  onValueChange={(value) => {
                                    if (!(task.canChangeStatus ?? (task.canEditTask ?? canWrite))) return;
                                    if (value) void moveTaskToStatus(task, value);
                                  }}
                                  disabled={!(task.canChangeStatus ?? (task.canEditTask ?? canWrite))}
                                >
                                  <SelectTrigger className="h-7 w-[112px] text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {stages.map((s) => (
                                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <div className="flex items-center gap-1">
                                  <button
                                    className={cn(
                                      "rounded border p-1",
                                      task.isFavorite ? "border-amber-300 bg-amber-50 text-amber-600" : "border-transparent text-slate-400 hover:border-slate-200 hover:text-slate-600"
                                    )}
                                    onClick={() => void toggleFavorite(task)}
                                    title="Favorite"
                                  >
                                    <Star className={cn("h-3.5 w-3.5", task.isFavorite && "fill-current")} />
                                  </button>
                                  <button
                                    className="rounded border border-transparent p-1 text-slate-400 hover:border-slate-200 hover:text-slate-600"
                                    onClick={() => void openEdit(task)}
                                    title="Edit"
                                    disabled={!(task.canEditTask ?? canWrite)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    className="rounded border border-transparent p-1 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                    onClick={() => setDeleteTarget(task)}
                                    title="Delete"
                                    disabled={!(task.canDelete ?? canManage) || deletingTaskId === task.id}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      <TaskModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => setRefreshToken((p) => p + 1)}
        users={users}
        groups={groups}
        initial={formInitial}
        stages={stages}
        meId={meId}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title="Delete task?"
        description={deleteTarget ? `This will permanently remove "${deleteTarget.title}".` : ""}
        confirmLabel="Delete"
        loading={Boolean(deleteTarget && deletingTaskId === deleteTarget.id)}
        onConfirm={() => {
          if (!deleteTarget) return;
          return removeTask(deleteTarget);
        }}
      />
    </div>
  );
}
