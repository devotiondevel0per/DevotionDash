"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
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
  Users,
  ArrowLeft,
  Pencil,
  List,
  Layers,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  assignee: { id: string; name: string; fullname: string; photoUrl: string | null } | null;
  phase: { id: string; name: string } | null;
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
  high: { label: "High", className: "bg-red-100 text-[#FE0000]" },
  normal: { label: "Normal", className: "bg-orange-100 text-orange-700" },
  low: { label: "Low", className: "bg-gray-100 text-gray-500" },
};

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
  return { ...task, status: normalizeTaskStatus(task.status) };
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
  existing?: Project;
  canManageProject?: boolean;
};

function ProjectFormDialog({
  open,
  onClose,
  onSaved,
  onDeleted,
  categories,
  existing,
  canManageProject = true,
}: ProjectFormDialogProps) {
  const isEdit = Boolean(existing);
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [categoryId, setCategoryId] = useState(existing?.category?.id ?? "");
  const [startDate, setStartDate] = useState(existing?.startDate ? existing.startDate.slice(0, 10) : "");
  const [endDate, setEndDate] = useState(existing?.endDate ? existing.endDate.slice(0, 10) : "");
  const [status, setStatus] = useState(existing?.status ?? "active");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setDescription(existing?.description ?? "");
      setCategoryId(existing?.category?.id ?? "");
      setStartDate(existing?.startDate ? existing.startDate.slice(0, 10) : "");
      setEndDate(existing?.endDate ? existing.endDate.slice(0, 10) : "");
      setStatus(existing?.status ?? "active");
      setConfirmDelete(false);
    }
  }, [open, existing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        categoryId: categoryId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        ...(isEdit ? { status } : {}),
      };
      const url = isEdit ? `/api/projects/${existing!.id}` : "/api/projects";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to save project");
      }
      const saved = (await res.json()) as Project;
      toast.success(isEdit ? "Project updated" : "Project created");
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save project");
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
        throw new Error(err?.error ?? "Failed to delete project");
      }
      toast.success("Project deleted");
      onDeleted?.(existing.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-4xl">
        <DialogHeader className="border-b bg-gradient-to-r from-slate-50 via-red-50 to-slate-50 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <FolderKanban className="h-5 w-5 text-[#FE0000]" />
            {isEdit ? "Edit Project" : "Create New Project"}
          </DialogTitle>
          <DialogDescription>Define timeline, category, and scope clearly before execution.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="proj-name">Name *</Label>
            <Input id="proj-name" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proj-desc">Description</Label>
            <Textarea id="proj-desc" placeholder="What is this project about?" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : (v ?? ""))} items={{ "none": "No category", ...Object.fromEntries(categories.map((c) => [c.id, c.name])) }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isEdit && canManageProject ? (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v ?? "")}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="proj-start" className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Start Date</Label>
              <Input id="proj-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-end" className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />End Date</Label>
              <Input id="proj-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {isEdit && canManageProject ? (
            <div className="pt-1 border-t">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-red-600 flex-1">Delete this project permanently?</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
                  <Button type="button" size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => void handleDelete()} disabled={deleting}>
                    {deleting ? "Deleting..." : "Yes, Delete"}
                  </Button>
                </div>
              ) : (
                <Button type="button" size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete Project
                </Button>
              )}
            </div>
          ) : null}

          <DialogFooter className="border-t pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting} style={{ backgroundColor: "#FE0000", color: "#fff" }}>
              {submitting ? "Saving..." : isEdit ? "Save Changes" : "Create Project"}
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
  const [description, setDescription] = useState(existing?.description ?? "");
  const [status, setStatus] = useState(resolveStatus(existing?.status));
  const [priority, setPriority] = useState(existing?.priority ?? "normal");
  const [assigneeId, setAssigneeId] = useState(existing?.assignee?.id ?? "");
  const [phaseId, setPhaseId] = useState(existing?.phase?.id ?? "");
  const [dueDate, setDueDate] = useState(existing?.dueDate ? existing.dueDate.slice(0, 10) : "");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(existing?.title ?? "");
      setDescription(existing?.description ?? "");
      setStatus(resolveStatus(existing?.status));
      setPriority(existing?.priority ?? "normal");
      setAssigneeId(existing?.assignee?.id ?? "");
      setPhaseId(existing?.phase?.id ?? "");
      setDueDate(existing?.dueDate ? existing.dueDate.slice(0, 10) : "");
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
        description: description.trim() || null,
        status,
        priority,
        assigneeId: assigneeId || null,
        phaseId: phaseId || null,
        dueDate: dueDate || null,
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
            <CheckSquare className="h-5 w-5 text-[#FE0000]" />
            {isEdit ? "Edit Project Task" : "Add Project Task"}
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
            <Textarea id="t-desc" placeholder="Optional details..." rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
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
            <Button type="submit" disabled={submitting} style={{ backgroundColor: "#FE0000", color: "#fff" }}>
              {submitting ? "Saving..." : isEdit ? "Save Changes" : "Add Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Phase Dialog ─────────────────────────────────────────────────────────

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
            <Button type="submit" disabled={submitting} style={{ backgroundColor: "#FE0000", color: "#fff" }}>
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
            <Button onClick={() => void handleAdd()} disabled={submitting || !selectedUserId} style={{ backgroundColor: "#FE0000", color: "#fff" }}>
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
        if (!res.ok) throw new Error("Failed to load project");
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
          toast.error(err instanceof Error ? err.message : "Failed to load project");
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
  const currentUserId = access?.userId ?? "";
  const myMembership = useMemo(
    () => members.find((member) => member.user.id === currentUserId),
    [members, currentUserId]
  );
  const isProjectMember = Boolean(myMembership);
  const isProjectManager = myMembership?.role === "manager";
  const canProjectWrite = canWrite && (canManage || isProjectMember);
  const canProjectManage = canWrite && (canManage || isProjectManager);

  async function toggleTaskStatus(task: ProjectTask) {
    const next = getNextTaskStageKey(taskStages, task.status);
    setTogglingTaskId(task.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      const updated = normalizeProjectTask((await res.json()) as ProjectTask);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch {
      toast.error("Failed to update task status");
    } finally {
      setTogglingTaskId(null);
    }
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
        <p>Project not found</p>
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
            Back to Projects
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
              <ProgressIndicator style={{ width: `${progress}%`, backgroundColor: "#FE0000" }} />
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
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#FE0000] data-[state=active]:text-[#FE0000] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 h-10 text-sm text-gray-500"
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
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    {tasks.length} task{tasks.length !== 1 ? "s" : ""}
                  </span>
                  {canProjectWrite && (
                    <Button
                      size="sm"
                      style={{ backgroundColor: "#FE0000", color: "#fff" }}
                      onClick={() => { setEditingTask(undefined); setTaskDialogOpen(true); }}
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
                        onClick={() => { setEditingTask(undefined); setTaskDialogOpen(true); }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add first task
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 hover:bg-gray-50">
                        <TableHead className="pl-4">Title</TableHead>
                        <TableHead className="w-28">Status</TableHead>
                        <TableHead className="w-24">Priority</TableHead>
                        <TableHead className="w-36">Assignee</TableHead>
                        <TableHead className="w-28">Phase</TableHead>
                        <TableHead className="w-28">Due Date</TableHead>
                        <TableHead className="w-10 pr-4"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map((task) => {
                        const assigneeName = task.assignee ? displayName(task.assignee) : "Unassigned";
                        return (
                          <TableRow
                            key={task.id}
                            className={cn("hover:bg-gray-50/80", canProjectWrite && "cursor-pointer")}
                            onClick={() => { if (!canProjectWrite) return; setEditingTask(task); setTaskDialogOpen(true); }}
                          >
                            <TableCell className="pl-4">
                              <span className="text-sm font-medium text-gray-800">{task.title}</span>
                              {task.description && (
                                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{task.description}</p>
                              )}
                            </TableCell>
                            <TableCell onClick={(e) => { if (!canProjectWrite) return; e.stopPropagation(); void toggleTaskStatus(task); }}>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs transition-opacity select-none",
                                  canProjectWrite && "cursor-pointer hover:opacity-80",
                                  togglingTaskId === task.id ? "opacity-50" : ""
                                )}
                                style={stageStyle(getTaskStage(taskStages, task.status).color)}
                                title={canProjectWrite ? "Click to move to next stage" : undefined}
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
                                onClick={() => { if (!canProjectWrite) return; setEditingTask(task); setTaskDialogOpen(true); }}
                                className="text-gray-300 hover:text-gray-600 transition-colors p-1 rounded"
                                title="Edit task"
                                disabled={!canProjectWrite}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
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
                    style={{ backgroundColor: "#FE0000", color: "#fff" }}
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
                  <p className="text-sm">No phases yet. Add one to structure your project.</p>
                </div>
              ) : (
                phases.map((phase, idx) => {
                  const phaseTasks = tasks.filter((t) => t.phase?.id === phase.id);
                  const phaseProgress = calcProgress(phaseTasks, taskStages);
                  return (
                    <div key={phase.id} className="flex items-center gap-4 p-4 bg-white rounded-xl border group">
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                        style={{ backgroundColor: "#FE0000" }}
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
                              <div className="h-full rounded-full" style={{ width: `${phaseProgress}%`, backgroundColor: "#FE0000" }} />
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
                    style={{ backgroundColor: "#FE0000", color: "#fff" }}
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
                        <Badge variant="secondary" className="text-xs shrink-0" style={{ backgroundColor: "#FFF0F0", color: "#FE0000" }}>
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
      <TaskDialog
        open={taskDialogOpen}
        onClose={() => { setTaskDialogOpen(false); setEditingTask(undefined); }}
        onSaved={(task) => {
          const normalizedTask = normalizeProjectTask(task);
          if (editingTask) {
            setTasks((prev) => prev.map((t) => (t.id === normalizedTask.id ? normalizedTask : t)));
          } else {
            setTasks((prev) => [normalizedTask, ...prev]);
          }
        }}
        onDeleted={(id) => setTasks((prev) => prev.filter((t) => t.id !== id))}
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
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: "#FE0000" }} />
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
            <Button size="sm" style={{ backgroundColor: "#FE0000", color: "#fff" }} onClick={onOpen}>
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

  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const loadProjects = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);
      try {
        const res = await fetch("/api/projects?limit=200");
        if (!res.ok) throw new Error("Failed to load projects");
        const data = (await res.json()) as Project[];
        setProjects(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!silent) {
          toast.error(err instanceof Error ? err.message : "Failed to load projects");
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
      { id: "all", label: "All Projects", Icon: FolderOpen, count: projects.length },
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
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Projects</h2>
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
                style={isActive ? { backgroundColor: "#FFF0F0", color: "#FE0000" } : undefined}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4" />
                  {label}
                </div>
                <span
                  className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0", isActive ? "text-white" : "bg-gray-100 text-gray-500")}
                  style={isActive ? { backgroundColor: "#FE0000" } : undefined}
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
                    style={isActive ? { backgroundColor: "#FFF0F0", color: "#FE0000" } : undefined}
                  >
                    <span className="truncate">{label}</span>
                    <span
                      className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0", isActive ? "text-white" : "bg-gray-100 text-gray-500")}
                      style={isActive ? { backgroundColor: "#FE0000" } : undefined}
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
              <Button size="sm" style={{ backgroundColor: "#FE0000", color: "#fff" }} onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                New Project
              </Button>
            )}
            <span className="text-sm text-gray-400">{filtered.length} project{filtered.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search projects..."
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
              <p className="text-sm font-medium">No projects found</p>
              {canWrite ? (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create your first project
                </Button>
              ) : null}
            </div>
          ) : (
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
          )}
        </div>
      </div>

      {/* Dialogs */}
      <ProjectFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={handleCreated}
        categories={categories}
      />
      <ProjectFormDialog
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditProject(null); }}
        onSaved={handleUpdated}
        onDeleted={handleDeleted}
        categories={categories}
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
