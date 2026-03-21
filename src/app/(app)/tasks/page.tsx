"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Columns3,
  Eye,
  FilePlus2,
  LayoutGrid,
  Link2,
  List,
  ListOrdered,
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Star,
  Trash2,
  Underline,
  User,
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
type TaskCategory = "open" | "closed" | "events" | "notes" | "favorites" | "subordinate" | "all";
type TaskLayout = "list" | "grid" | "kanban";

type TaskUser = { id: string; fullname: string; email?: string };

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
  assignees: Array<{ id: string; user: { id: string; name: string; fullname: string } }>;
  isFavorite?: boolean;
};

type TaskComment = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; fullname: string };
};

type TaskMetaResponse = {
  users: TaskUser[];
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
  assigneeIds: string[];
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
  { id: "closed", label: "Closed" },
  { id: "events", label: "Events" },
  { id: "notes", label: "Notes" },
  { id: "favorites", label: "Favorites" },
  { id: "subordinate", label: "Subordinate" },
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
  const label = stage?.label ?? key;
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
  assigneeIds: [],
  type: "task",
  status: "opened",
  priority: "normal",
  dueDate: "",
  isPrivate: false,
  descriptionHtml: "",
};

const BIDI_CONTROL_REGEX = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function nameOf(user: { name: string; fullname: string }) {
  return user.fullname?.trim() || user.name || "Unknown";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString();
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
          <Button className="h-9 bg-[#FE0000] text-white hover:bg-[#d40000]" onClick={onApply}>Filter</Button>
          <Button className="h-9" variant="outline" onClick={onReset}>Reset</Button>
        </div>
      </div>
    </div>
  );
}

function EditorToolbar({ onCommand, disabled }: { onCommand: (command: string, value?: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b bg-slate-50 p-1.5">
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => onCommand("bold")} disabled={disabled}><span className="font-bold">B</span></Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => onCommand("italic")} disabled={disabled}><span className="italic">I</span></Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => onCommand("underline")} disabled={disabled}><Underline className="h-3.5 w-3.5" /></Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => onCommand("insertUnorderedList")} disabled={disabled}><List className="h-3.5 w-3.5" /></Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => onCommand("insertOrderedList")} disabled={disabled}><ListOrdered className="h-3.5 w-3.5" /></Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
        const url = window.prompt("Enter URL", "https://");
        if (url) onCommand("createLink", url);
      }} disabled={disabled}><Link2 className="h-3.5 w-3.5" /></Button>
    </div>
  );
}
function TaskModal({
  open,
  onClose,
  onSaved,
  users,
  initial,
  stages,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  users: TaskUser[];
  initial: TaskFormState;
  stages: WorkflowStage[];
}) {
  const [form, setForm] = useState<TaskFormState>(initial);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(initial);
    setFiles([]);
  }, [open, initial]);

  const sanitizeText = useCallback((value: string) => value.replace(BIDI_CONTROL_REGEX, ""), []);

  const exec = useCallback((command: string, value?: string) => {
    const textarea = editorTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;

    setForm((prev) => {
      const source = prev.descriptionHtml || "";
      const selected = source.slice(start, end);
      const fallback = selected || "text";

      let insertText = selected;
      if (command === "bold") insertText = `<strong>${fallback}</strong>`;
      else if (command === "italic") insertText = `<em>${fallback}</em>`;
      else if (command === "underline") insertText = `<u>${fallback}</u>`;
      else if (command === "insertUnorderedList") {
        const lines = (selected || "Item").split(/\r?\n/).filter((line) => line.trim().length > 0);
        insertText = `<ul>${lines.map((line) => `<li>${line}</li>`).join("")}</ul>`;
      } else if (command === "insertOrderedList") {
        const lines = (selected || "Item").split(/\r?\n/).filter((line) => line.trim().length > 0);
        insertText = `<ol>${lines.map((line) => `<li>${line}</li>`).join("")}</ol>`;
      } else if (command === "createLink") {
        const href = (value ?? "").trim();
        if (!href) return prev;
        insertText = `<a href="${href}" target="_blank" rel="noopener noreferrer">${selected || href}</a>`;
      }

      const next = sanitizeText(source.slice(0, start) + insertText + source.slice(end));

      queueMicrotask(() => {
        const cursor = start + insertText.length;
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
      });

      return { ...prev, descriptionHtml: next };
    });
  }, [sanitizeText]);

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
    if (!form.title.trim()) {
      toast.error("Subject is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.descriptionHtml,
        type: form.type,
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate || null,
        isPrivate: form.isPrivate,
        assigneeIds: form.assigneeIds,
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

  const selected = useMemo(() => new Set(form.assigneeIds), [form.assigneeIds]);
  const titleIcon = form.id ? <Pencil className="h-5 w-5 text-[#FE0000]" /> : <FilePlus2 className="h-5 w-5 text-[#FE0000]" />;

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

            <div className="rounded-md border">
              <EditorToolbar onCommand={exec} disabled={saving} />
              <textarea
                ref={editorTextareaRef}
                dir="ltr"
                spellCheck
                value={form.descriptionHtml}
                onChange={(event) => setForm((prev) => ({ ...prev, descriptionHtml: sanitizeText(event.target.value) }))}
                className="h-52 w-full resize-none border-0 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none"
                placeholder="Write description (HTML supported)."
              />
              <div className="border-t bg-slate-50 px-3 py-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Preview</p>
                <div
                  dir="ltr"
                  className="max-h-32 overflow-auto rounded border bg-white px-2 py-1.5 text-sm text-slate-700"
                  dangerouslySetInnerHTML={{ __html: form.descriptionHtml || "<span class='text-slate-400'>No content</span>" }}
                />
              </div>
            </div>

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
            <div className="max-h-72 space-y-1 overflow-y-auto rounded border bg-white p-2">
              {users.length === 0 ? <p className="text-xs text-slate-500">No users available</p> : users.map((u) => (
                <label key={u.id} className="flex cursor-pointer gap-2 rounded px-2 py-1.5 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? Array.from(new Set([...form.assigneeIds, u.id]))
                        : form.assigneeIds.filter((id) => id !== u.id);
                      setForm((p) => ({ ...p, assigneeIds: next }));
                    }}
                  />
                  <span className="min-w-0 text-sm">
                    <span className="block truncate font-medium text-slate-800">{u.fullname}</span>
                    {u.email ? <span className="block truncate text-xs text-slate-500">{u.email}</span> : null}
                  </span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 rounded border bg-white px-3 py-2 text-sm">
              <input type="checkbox" checked={form.isPrivate} onChange={(e) => setForm((p) => ({ ...p, isPrivate: e.target.checked }))} />
              Private task
            </label>
          </div>
          </div>

          <DialogFooter className="border-t px-6 py-3">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button className="bg-[#FE0000] text-white hover:bg-[#d40000]" onClick={() => void submit()} disabled={saving}>
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
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !task) return;
    setComments([]);
    setCommentText("");
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

  async function postComment() {
    if (!task || !commentText.trim()) return;
    setPosting(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      const data = (await response.json().catch(() => null)) as TaskComment | { error?: string } | null;
      if (!response.ok || !data || "error" in data) throw new Error((data as { error?: string } | null)?.error ?? "Failed to post comment");
      setComments((prev) => [...prev, data as TaskComment]);
      setCommentText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  }

  if (!task) return null;
  const stageMeta = getStageMeta(stages, task.status);
  const isClosed = stages.find((s) => s.key === task.status)?.isClosed ?? false;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b bg-gradient-to-r from-slate-50 via-red-50 to-slate-50 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg leading-tight">
            <MessageSquare className="h-5 w-5 shrink-0 text-[#FE0000]" />
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
              <span>Created: <span className="font-medium text-slate-800">{formatDate(task.createdAt)}</span></span>
            </div>
            {task.description ? (
              <div
                dir="ltr"
                className="max-h-28 overflow-auto rounded border bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700"
                dangerouslySetInnerHTML={{ __html: toHtml(task.description) }}
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
            ) : comments.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No comments yet. Be the first to add one.</p>
            ) : (
              comments.map((comment) => {
                const isMe = comment.user.id === meId;
                return (
                  <div key={comment.id} className={cn("flex gap-3", isMe && "flex-row-reverse")}>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                      {(comment.user.fullname || comment.user.name || "?")[0].toUpperCase()}
                    </div>
                    <div className={cn("max-w-[75%] space-y-1", isMe && "items-end")}>
                      <div className={cn("flex items-center gap-2 text-[11px] text-slate-500", isMe && "flex-row-reverse")}>
                        <span className="font-medium text-slate-700">{comment.user.fullname || comment.user.name}</span>
                        <span>{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <div className={cn("rounded-xl px-3 py-2 text-sm leading-relaxed", isMe ? "bg-[#FE0000]/10 text-slate-800" : "bg-slate-100 text-slate-800")}>
                        {comment.content}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Comment input */}
          <div className="shrink-0 border-t bg-white px-6 py-3">
            <div className="flex items-end gap-2">
              <textarea
                dir="ltr"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void postComment();
                  }
                }}
                placeholder="Write a comment… (Enter to send, Shift+Enter for new line)"
                className="flex-1 resize-none rounded-lg border bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#FE0000]/40 focus:ring-1 focus:ring-[#FE0000]/20"
                rows={2}
                disabled={posting}
              />
              <Button
                className="h-10 bg-[#FE0000] text-white hover:bg-[#d40000]"
                size="icon"
                onClick={() => void postComment()}
                disabled={posting || !commentText.trim()}
              >
                {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
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
  const router = useRouter();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [stages, setStages] = useState<WorkflowStage[]>([
    { key: "opened", label: "Open", color: "#22c55e", isClosed: false, isDefault: true, order: 0 },
    { key: "completed", label: "Completed", color: "#3b82f6", isClosed: true, isDefault: false, order: 1 },
    { key: "closed", label: "Closed", color: "#64748b", isClosed: true, isDefault: false, order: 2 },
  ]);
  const [users, setUsers] = useState<TaskUser[]>([]);
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
      setMeId(data.currentUserId ?? "");
    } catch {
      toast.error("Failed to load task metadata");
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams(view, category, statusScope, search, filterApplied);
      const response = await fetch(`/api/tasks?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to load tasks");
      }
      const data = (await response.json()) as { items: TaskItem[]; stages: WorkflowStage[] } | TaskItem[];
      if (Array.isArray(data)) {
        setTasks(data);
      } else {
        setTasks(Array.isArray(data.items) ? data.items : []);
        if (Array.isArray(data.stages) && data.stages.length > 0) setStages(data.stages);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [category, filterApplied, search, statusScope, view]);

  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => { void loadTasks(); }, [loadTasks, refreshToken]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of CATEGORY_ITEMS) map.set(item.id, 0);
    const openKeys = new Set(stages.filter((s) => !s.isClosed).map((s) => s.key));
    const closedKeys = new Set(stages.filter((s) => s.isClosed).map((s) => s.key));
    for (const task of tasks) {
      map.set("all", (map.get("all") ?? 0) + 1);
      if (openKeys.has(task.status)) map.set("open", (map.get("open") ?? 0) + 1);
      if (closedKeys.has(task.status)) map.set("closed", (map.get("closed") ?? 0) + 1);
      if (task.type === "event") map.set("events", (map.get("events") ?? 0) + 1);
      if (task.type === "note") map.set("notes", (map.get("notes") ?? 0) + 1);
      if (task.isFavorite) map.set("favorites", (map.get("favorites") ?? 0) + 1);
      if (meId && task.creatorId !== meId) map.set("subordinate", (map.get("subordinate") ?? 0) + 1);
    }
    return map;
  }, [meId, tasks, stages]);

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
    setFormInitial(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(task: TaskItem) {
    setFormInitial({
      id: task.id,
      title: task.title,
      assigneeIds: task.assignees.map((entry) => entry.user.id),
      type: task.type,
      status: task.status,
      priority: task.priority,
      dueDate: toDateInput(task.dueDate),
      isPrivate: task.isPrivate,
      descriptionHtml: toHtml(task.description),
    });
    setFormOpen(true);
  }

  function openDetail(task: TaskItem) {
    router.push(`/tasks/${task.id}`);
  }

  async function patchTask(id: string, payload: Record<string, unknown>) {
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
  }

  async function toggleComplete(task: TaskItem) {
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
    try {
      const stageMeta = getStageMeta(stages, status);
      await patchTask(task.id, { status });
      toast.success(`Task moved to ${stageMeta.label.toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Task update failed");
    }
  }

  async function toggleFavorite(task: TaskItem) {
    try {
      const response = await fetch(`/api/tasks/${task.id}/favorite`, { method: task.isFavorite ? "DELETE" : "POST" });
      const data = (await response.json().catch(() => null)) as { isFavorite: boolean; favoriteCount: number; error?: string } | null;
      if (!response.ok || !data) throw new Error(data?.error ?? "Favorite update failed");
      setTasks((prev) => prev.map((entry) => entry.id === task.id ? { ...entry, isFavorite: data.isFavorite } : entry));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Favorite update failed");
    }
  }

  async function removeTask(task: TaskItem) {
    setDeletingTaskId(task.id);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Delete failed");
      }
      setTasks((prev) => prev.filter((entry) => entry.id !== task.id));
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
                  active ? "font-medium text-[#FE0000]" : "text-gray-600 hover:bg-gray-100"
                )}
                style={active ? { backgroundColor: "#FFF0F0" } : undefined}
              >
                <span>{item.label}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium",
                    active ? "text-white" : "bg-gray-100 text-gray-500"
                  )}
                  style={active ? { backgroundColor: "#FE0000" } : undefined}
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
                  active ? "font-medium text-[#FE0000]" : "text-gray-600 hover:bg-gray-100"
                )}
                style={active ? { backgroundColor: "#FFF0F0" } : undefined}
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
                <Button className="h-8 bg-[#FE0000] text-xs text-white hover:bg-[#d40000]" onClick={openCreate}>
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
                      active ? "bg-[#FE0000] text-white" : "text-slate-600 hover:bg-slate-100"
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
            <div className="min-w-[980px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[44px_1.8fr_130px_180px_170px_170px] border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <span className="text-center">#</span>
                <span>Subject</span>
                <span>Status</span>
                <span>Due</span>
                <span>Responsible</span>
                <span className="text-right">Actions</span>
              </div>
              {tasks.map((task) => {
                const done = stages.find((s) => s.key === task.status)?.isClosed ?? false;
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "grid grid-cols-[44px_1.8fr_130px_180px_170px_170px] items-center border-b border-slate-200 px-3 py-2 text-xs",
                      done ? "bg-red-50/30" : "bg-white hover:bg-slate-50"
                    )}
                  >
                    <button
                      className="mx-auto flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-slate-500 hover:border-[#FE0000] hover:text-[#FE0000]"
                      onClick={() => void toggleComplete(task)}
                      title={done ? "Reopen" : "Complete"}
                      disabled={!canWrite}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : null}
                    </button>

                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          className={cn("truncate text-left font-semibold text-slate-800 hover:text-[#FE0000] hover:underline", done && "line-through text-slate-500")}
                          onClick={() => openDetail(task)}
                          title="View details & comments"
                        >{task.title}</button>
                        <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", PRIORITY_META[task.priority])}>{task.priority}</Badge>
                        <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", TYPE_META[task.type])}>{task.type}</Badge>
                      </div>
                      {task.description ? <p className="truncate text-xs text-slate-500">{toText(task.description)}</p> : null}
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
                        onClick={() => openEdit(task)}
                        title="Edit"
                        disabled={!canWrite}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="rounded border border-transparent p-1 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setDeleteTarget(task)}
                        title="Delete"
                        disabled={!canWrite || deletingTaskId === task.id}
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
              {tasks.map((task) => (
                <article key={task.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      className={cn("line-clamp-2 text-left text-sm font-semibold text-slate-900 hover:text-[#FE0000] hover:underline", (stages.find((s) => s.key === task.status)?.isClosed ?? false) && "line-through text-slate-500")}
                      onClick={() => openDetail(task)}
                      title="View details & comments"
                    >
                      {task.title}
                    </button>
                    <button
                      className="rounded border border-slate-200 p-1 text-slate-500 hover:border-[#FE0000] hover:text-[#FE0000]"
                      onClick={() => void toggleComplete(task)}
                      disabled={!canWrite}
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

                  <p className="mt-2 line-clamp-3 min-h-[3.5rem] text-xs text-slate-600">{toText(task.description) || "No description"}</p>

                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                      Due: {formatDate(task.dueDate)}
                    </div>
                    <div className="truncate">Assigned: {task.assignees.length > 0 ? task.assignees.map((entry) => nameOf(entry.user)).join(", ") : "-"}</div>
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
                      onClick={() => openEdit(task)}
                      title="Edit"
                      disabled={!canWrite}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="rounded border border-transparent p-1 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      onClick={() => setDeleteTarget(task)}
                      title="Delete"
                      disabled={!canWrite || deletingTaskId === task.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              ))}
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
                              draggable={canWrite}
                              onDragStart={() => setDragTaskId(task.id)}
                              onDragEnd={() => setDragTaskId(null)}
                              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                            >
                              <button
                                className={cn("line-clamp-2 w-full text-left text-sm font-semibold text-slate-900 hover:text-[#FE0000] hover:underline", stage.isClosed && "line-through text-slate-500")}
                                onClick={() => openDetail(task)}
                                title="View details & comments"
                              >
                                {task.title}
                              </button>
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", PRIORITY_META[task.priority as TaskPriority])}>{task.priority}</Badge>
                                <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", TYPE_META[task.type as TaskType])}>{task.type}</Badge>
                              </div>
                              <p className="mt-2 line-clamp-2 text-xs text-slate-600">{toText(task.description) || "No description"}</p>
                              <div className="mt-2 text-xs text-slate-500">Due: {formatDate(task.dueDate)}</div>

                              <div className="mt-3 flex items-center justify-between gap-2">
                                <Select
                                  value={task.status}
                                  onValueChange={(value) => {
                                    if (value) void moveTaskToStatus(task, value);
                                  }}
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
                                    onClick={() => openEdit(task)}
                                    title="Edit"
                                    disabled={!canWrite}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    className="rounded border border-transparent p-1 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                    onClick={() => setDeleteTarget(task)}
                                    title="Delete"
                                    disabled={!canWrite || deletingTaskId === task.id}
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

      <TaskModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => setRefreshToken((p) => p + 1)} users={users} initial={formInitial} stages={stages} />
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
