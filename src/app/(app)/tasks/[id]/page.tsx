"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Image,
  Loader2,
  MessageSquare,
  Paperclip,
  Reply,
  Send,
  Star,
  User,
  X,
} from "lucide-react";

type WorkflowStage = {
  key: string;
  label: string;
  color: string;
  isClosed: boolean;
  isDefault: boolean;
  order: number;
};

type TaskUser = { id: string; name: string; fullname: string };

type TaskAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
};

type TaskComment = {
  id: string;
  content: string;
  createdAt: string;
  user: TaskUser;
  attachments: TaskAttachment[];
};

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  isPrivate: boolean;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  creatorId: string;
  creator: TaskUser;
  assignees: Array<{ id: string; userId?: string; canComment?: boolean; user: TaskUser }>;
  comments: TaskComment[];
  attachments: TaskAttachment[];
  canComment?: boolean;
  isFavorite: boolean;
  favoriteCount: number;
};

const PRIORITY_META: Record<string, { cls: string; label: string }> = {
  high: { cls: "border-red-200 bg-red-100 text-red-700", label: "High" },
  normal: { cls: "border-amber-200 bg-amber-100 text-amber-700", label: "Normal" },
  low: { cls: "border-slate-200 bg-slate-100 text-slate-700", label: "Low" },
};

const TYPE_META: Record<string, { cls: string; label: string }> = {
  task: { cls: "border-slate-200 bg-slate-100 text-slate-700", label: "Task" },
  event: { cls: "border-blue-200 bg-blue-100 text-blue-700", label: "Event" },
  note: { cls: "border-violet-200 bg-violet-100 text-violet-700", label: "Note" },
};

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function getStageMeta(stages: WorkflowStage[], key: string) {
  const stage = stages.find((s) => s.key === key);
  const color = stage?.color ?? "#64748b";
  const { r, g, b } = hexToRgb(color.startsWith("#") && color.length === 7 ? color : "#64748b");
  return {
    label: stage?.label ?? key
      .split("_")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" "),
    badgeStyle: {
      borderColor: `rgba(${r},${g},${b},0.3)`,
      backgroundColor: `rgba(${r},${g},${b},0.1)`,
      color,
    },
  };
}

function nameOf(user: TaskUser) {
  return user.fullname?.trim() || user.name || "?";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString();
}

function formatDateTime(value: string) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

function initials(name: string) {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type PendingFile = { id: string; file: File; previewUrl: string | null };

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildReplyQuote(comment: TaskComment) {
  const author = nameOf(comment.user);
  const preview = toText(comment.content).slice(0, 220) || "Attachment";
  return `<p><strong>Replying to ${escapeHtml(author)}:</strong></p><blockquote><p>${escapeHtml(preview)}</p></blockquote>`;
}

type TimelineEntry =
  | { kind: "created"; at: string }
  | { kind: "comment"; comment: TaskComment };

function buildTimeline(task: TaskDetail): TimelineEntry[] {
  const entries: TimelineEntry[] = [{ kind: "created", at: task.createdAt }];
  for (const comment of task.comments) {
    entries.push({ kind: "comment", comment });
  }
  entries.sort((a, b) => {
    const aTime = a.kind === "created" ? a.at : a.comment.createdAt;
    const bTime = b.kind === "created" ? b.at : b.comment.createdAt;
    return new Date(aTime).getTime() - new Date(bTime).getTime();
  });
  return entries;
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const { can } = usePermissions();
  const canWrite = can("tasks", "write");
  const canManage = can("tasks", "manage");
  const meId = session?.user?.id ?? "";

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<"conversation" | "details">("conversation");
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentHtml, setEditingCommentHtml] = useState("");
  const [replyToComment, setReplyToComment] = useState<TaskComment | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadTask = useCallback(async () => {
    try {
      const [taskRes, stagesRes] = await Promise.all([
        fetch(`/api/tasks/${id}`, { cache: "no-store" }),
        fetch("/api/tasks?limit=1", { cache: "no-store" }),
      ]);
      if (!taskRes.ok) {
        if (taskRes.status === 404) { setError("Task not found"); return; }
        throw new Error("Failed to load task");
      }
      const taskData = (await taskRes.json()) as TaskDetail;
      setTask(taskData);

      if (stagesRes.ok) {
        const stagesData = (await stagesRes.json()) as { stages?: WorkflowStage[] };
        if (Array.isArray(stagesData.stages) && stagesData.stages.length > 0) {
          setStages(stagesData.stages);
        }
      }
    } catch {
      setError("Failed to load task");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadTask(); }, [loadTask]);

  useEffect(() => {
    setEditingCommentId(null);
    setEditingCommentHtml("");
    setReplyToComment(null);
  }, [id]);

  useEffect(() => {
    if (task) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [task?.comments.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const newPending: PendingFile[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      previewUrl: isImage(file.type) ? URL.createObjectURL(file) : null,
    }));
    setPendingFiles((prev) => [...prev, ...newPending]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePending(id: string) {
    setPendingFiles((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function uploadFiles(commentId: string): Promise<boolean> {
    if (pendingFiles.length === 0) return true;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("commentId", commentId);
      for (const p of pendingFiles) formData.append("files", p.file);
      const res = await fetch(`/api/tasks/${id}/uploads`, { method: "POST", body: formData });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? "Upload failed");
      }
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function postComment() {
    if (!task) return;
    const normalizedContent = normalizeRichText(commentText);
    const hasText = hasRichTextContent(normalizedContent);
    const hasFiles = pendingFiles.length > 0;
    if (!hasText && !hasFiles) return;
    if (!canComment) {
      toast.error("You can view this task, but commenting is disabled for your assignment");
      return;
    }
    const content = replyToComment
      ? `${buildReplyQuote(replyToComment)}${normalizedContent}`
      : normalizedContent;

    setPosting(true);
    try {
      const res = await fetch(`/api/tasks/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, allowEmpty: hasFiles }),
      });
      const data = (await res.json().catch(() => null)) as TaskComment | { error?: string } | null;
      if (!res.ok || !data || "error" in data) {
        throw new Error((data as { error?: string } | null)?.error ?? "Failed to post comment");
      }

      const created = data as TaskComment;
      if (hasFiles) {
        const ok = await uploadFiles(created.id);
        if (!ok) {
          setPosting(false);
          return;
        }
      }

      await loadTask();
      setCommentText("");
      setPendingFiles([]);
      setReplyToComment(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post");
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
      const response = await fetch(`/api/tasks/${id}/comments/${editingCommentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await response.json().catch(() => null)) as TaskComment | { error?: string } | null;
      if (!response.ok || !data || "error" in data) {
        throw new Error((data as { error?: string } | null)?.error ?? "Failed to update comment");
      }
      const updated = data as TaskComment;
      setTask((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.map((item) => (item.id === updated.id ? updated : item)),
            }
          : prev
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

  async function updateTaskStatus(nextStatus: string) {
    if (!task || !nextStatus || nextStatus === task.status || changingStatus) return;
    setChangingStatus(true);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await res.json().catch(() => null)) as TaskDetail | { error?: string } | null;
      if (!res.ok || !data || "error" in data) {
        throw new Error((data as { error?: string } | null)?.error ?? "Failed to update stage");
      }
      setTask(data as TaskDetail);
      toast.success(`Task moved to ${getStageMeta(stages, nextStatus).label.toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update stage");
    } finally {
      setChangingStatus(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="p-6">
        <Button variant="outline" size="sm" className="mb-4" onClick={() => router.push("/tasks")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />Back to Tasks
        </Button>
        <p className="text-sm text-slate-500">{error ?? "Task not found"}</p>
      </div>
    );
  }

  const stageMeta = getStageMeta(stages, task.status);
  const isClosed = stages.find((s) => s.key === task.status)?.isClosed ?? false;
  const priorityMeta = PRIORITY_META[task.priority] ?? PRIORITY_META.normal;
  const typeMeta = TYPE_META[task.type] ?? TYPE_META.task;
  const timeline = buildTimeline(task);
  const canEditConversation = task.type === "note" && canWrite;
  const canComment =
    task.canComment ??
    (canManage ||
      task.creatorId === meId ||
      task.assignees.some(
        (entry) => entry.user.id === meId && (entry.canComment ?? true)
      ));
  const commentAttachmentCount = task.comments.reduce(
    (count, comment) => count + comment.attachments.length,
    0
  );
  const totalAttachmentCount = task.attachments.length + commentAttachmentCount;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header bar */}
      <div className="sticky top-0 z-10 border-b bg-white px-4 py-3 shadow-sm sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-slate-600 hover:text-slate-900"
            onClick={() => router.push("/tasks")}
          >
            <ArrowLeft className="h-4 w-4" />
            Tasks
          </Button>
          <span className="text-slate-300">/</span>
          <span className="max-w-sm truncate text-sm font-medium text-slate-700">{task.title}</span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* Task title + badges */}
        <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start gap-2">
            <h1 className={cn("flex-1 text-xl font-bold text-slate-900 leading-snug", isClosed && "line-through text-slate-400")}>
              {task.title}
            </h1>
            {task.isFavorite && <Star className="mt-1 h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline" style={stageMeta.badgeStyle} className="h-6 px-2 text-xs">
              {stageMeta.label}
            </Badge>
            {canWrite ? (
              <Select
                value={task.status}
                onValueChange={(value) => {
                  if (value) void updateTaskStatus(value);
                }}
                disabled={changingStatus}
              >
                <SelectTrigger className="h-6 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.key} value={stage.key}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Badge variant="outline" className={cn("h-6 px-2 text-xs", priorityMeta.cls)}>
              {priorityMeta.label}
            </Badge>
            <Badge variant="outline" className={cn("h-6 px-2 text-xs", typeMeta.cls)}>
              {typeMeta.label}
            </Badge>
            {task.isPrivate && (
              <Badge variant="outline" className="h-6 px-2 text-xs border-rose-200 bg-rose-50 text-rose-700">
                Private
              </Badge>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              <span className="font-medium text-slate-700">{nameOf(task.creator)}</span>
            </span>
            {task.assignees.length > 0 && (
              <span className="flex items-center gap-1">
                Assigned:&nbsp;
                <span className="font-medium text-slate-700">
                  {task.assignees.map((a) => nameOf(a.user)).join(", ")}
                </span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Created {formatDate(task.createdAt)}
            </span>
            {task.dueDate && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                Due {formatDate(task.dueDate)}
              </span>
            )}
            {task.completedAt && (
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done {formatDate(task.completedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-2 border-b">
          {(["conversation", "details"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                tab === t
                  ? "border-[#AA8038] text-[#AA8038]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              {t === "conversation" ? (
                <><MessageSquare className="h-4 w-4" />Conversation ({task.comments.length})</>
              ) : (
                <><FileText className="h-4 w-4" />Details</>
              )}
            </button>
          ))}
        </div>

        {/* Conversation tab */}
        {tab === "conversation" && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Task Description</p>
              {task.description ? (
                <div
                  dir="ltr"
                  className="prose prose-sm max-w-none text-slate-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: normalizeRichText(toHtml(task.description)) }}
                />
              ) : (
                <p className="text-sm italic text-slate-400">No description provided.</p>
              )}
            </div>

            {/* Timeline */}
            <div className="space-y-3">
              {timeline.map((entry, idx) => {
                if (entry.kind === "created") {
                  return (
                    <div key={`created-${idx}`} className="flex items-center gap-3 text-xs text-slate-400">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="shrink-0 rounded-full border bg-white px-2 py-0.5">
                        Task created · {formatDateTime(entry.at)}
                      </span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                  );
                }

                const comment = entry.comment;
                const isMe = comment.user.id === meId;
                const canEditComment = canEditConversation && isMe;
                const isEditing = editingCommentId === comment.id;
                return (
                  <div
                    key={comment.id}
                    className={cn(
                      "rounded-xl border px-3 py-3 shadow-sm",
                      isMe
                        ? "border-[#AA8038]/25 bg-[#AA8038]/[0.03]"
                        : "border-slate-200 bg-white"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-300 to-slate-400 text-xs font-semibold text-white">
                        {initials(nameOf(comment.user))}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span className="font-medium text-slate-700">{nameOf(comment.user)}</span>
                          {isMe ? (
                            <span className="rounded-full bg-[#AA8038]/10 px-2 py-0.5 text-[10px] font-semibold text-[#C78100]">
                              You
                            </span>
                          ) : null}
                          <span>{formatDateTime(comment.createdAt)}</span>
                          {canComment && !isEditing ? (
                            <button
                              type="button"
                              className="rounded px-1 py-0.5 text-[11px] font-medium text-[#C78100] hover:bg-[#AA8038]/10"
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
                              className="rounded px-1 py-0.5 text-[11px] font-medium text-[#C78100] hover:bg-[#AA8038]/10"
                              onClick={() => {
                                setEditingCommentId(comment.id);
                                setEditingCommentHtml(normalizeRichText(toHtml(comment.content)));
                              }}
                            >
                              Edit
                            </button>
                          ) : null}
                        </div>
                        {isEditing ? (
                          <div className="space-y-2 rounded-lg border bg-white p-2">
                            <RichTextEditor
                              value={editingCommentHtml}
                              onChange={setEditingCommentHtml}
                              placeholder="Edit conversation..."
                              minHeight={110}
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
                                {comment.attachments.map((att) => (
                                  <a
                                    key={att.id}
                                    href={att.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 rounded-lg border bg-white px-2.5 py-2 text-xs hover:bg-slate-50"
                                  >
                                    {isImage(att.mimeType) ? (
                                      <Image className="h-4 w-4 shrink-0 text-blue-500" />
                                    ) : (
                                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                                    )}
                                    <div className="min-w-0">
                                      <p className="truncate font-medium text-slate-700">{att.fileName}</p>
                                      <p className="text-slate-400">{formatFileSize(att.fileSize)}</p>
                                    </div>
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Attachments */}
            {task.attachments.length > 0 && (
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" />
                  Task Files ({task.attachments.length})
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {task.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={att.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-2 overflow-hidden rounded-lg border bg-slate-50 px-3 py-2 text-xs hover:bg-slate-100 transition-colors"
                    >
                      {isImage(att.mimeType) ? (
                        <Image className="h-4 w-4 shrink-0 text-blue-500" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-700 group-hover:text-[#AA8038]">{att.fileName}</p>
                        <p className="text-slate-400">{formatFileSize(att.fileSize)}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />

            {/* Comment input */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Add Comment</p>
              {replyToComment ? (
                <div className="mb-3 flex items-start justify-between gap-2 rounded-lg border border-[#AA8038]/30 bg-[#AA8038]/10 px-3 py-2 text-xs">
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
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  You can view this task, but commenting is disabled for your assignment.
                </div>
              ) : null}

              {/* Pending files preview */}
              {pendingFiles.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {pendingFiles.map((p) => (
                    <div key={p.id} className="relative flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-xs">
                      {p.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.previewUrl} alt={p.file.name} className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <FileText className="h-5 w-5 text-slate-400" />
                      )}
                      <div className="min-w-0">
                        <p className="max-w-[120px] truncate font-medium text-slate-700">{p.file.name}</p>
                        <p className="text-slate-400">{formatFileSize(p.file.size)}</p>
                      </div>
                      <button
                        onClick={() => removePending(p.id)}
                        className="ml-1 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <RichTextEditor
                  value={commentText}
                  onChange={setCommentText}
                  placeholder="Write a comment..."
                  minHeight={130}
                  disabled={posting || uploading || !canComment}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    title="Attach files"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={posting || uploading || !canComment}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button
                    className="h-9 w-9 bg-[#AA8038] text-white hover:bg-[#D48A00]"
                    size="icon"
                    onClick={() => void postComment()}
                    disabled={posting || uploading || !canComment || (!hasRichTextContent(commentText) && pendingFiles.length === 0)}
                  >
                    {posting || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={pickFile}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              />
              <p className="mt-1.5 text-[11px] text-slate-400">
                Attach images, PDFs, documents. Max 10 MB per file, up to 8 files.
              </p>
            </div>
          </div>
        )}

        {/* Details tab */}
        {tab === "details" && (
          <div className="space-y-4">
            {/* Description */}
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Description</p>
              {task.description ? (
                <div
                  dir="ltr"
                  className="prose prose-sm max-w-none text-slate-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: normalizeRichText(toHtml(task.description)) }}
                />
              ) : (
                <p className="text-sm italic text-slate-400">No description provided.</p>
              )}
            </div>

            {/* Metadata */}
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Details</p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-slate-400">Status</dt>
                  <dd className="mt-0.5 font-medium">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" style={stageMeta.badgeStyle} className="h-5 px-1.5 text-[11px]">
                        {stageMeta.label}
                      </Badge>
                      {canWrite ? (
                        <Select
                          value={task.status}
                          onValueChange={(value) => {
                            if (value) void updateTaskStatus(value);
                          }}
                          disabled={changingStatus}
                        >
                          <SelectTrigger className="h-7 w-[140px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {stages.map((stage) => (
                              <SelectItem key={stage.key} value={stage.key}>
                                {stage.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Priority</dt>
                  <dd className="mt-0.5 font-medium">
                    <Badge variant="outline" className={cn("h-5 px-1.5 text-[11px]", priorityMeta.cls)}>
                      {priorityMeta.label}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Type</dt>
                  <dd className="mt-0.5 font-medium">
                    <Badge variant="outline" className={cn("h-5 px-1.5 text-[11px]", typeMeta.cls)}>
                      {typeMeta.label}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Creator</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{nameOf(task.creator)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Assigned To</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {task.assignees.length > 0
                      ? task.assignees.map((a) => nameOf(a.user)).join(", ")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Due Date</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{formatDate(task.dueDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Created</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{formatDateTime(task.createdAt)}</dd>
                </div>
                {task.completedAt && (
                  <div>
                    <dt className="text-xs text-slate-400">Completed</dt>
                    <dd className="mt-0.5 font-medium text-emerald-700">{formatDateTime(task.completedAt)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-slate-400">Private</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{task.isPrivate ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Your Comment Access</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{canComment ? "Can Comment" : "View Only"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Comments</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{task.comments.length}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Attachments</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{totalAttachmentCount}</dd>
                </div>
              </dl>
            </div>

            {/* Attachments in details tab */}
            {task.attachments.length > 0 && (
              <div className="rounded-xl border bg-white p-5 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" />
                  Task Files ({task.attachments.length})
                </p>
                <div className="space-y-2">
                  {task.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={att.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-slate-50 transition-colors group"
                    >
                      {isImage(att.mimeType) ? (
                        <Image className="h-5 w-5 shrink-0 text-blue-500" />
                      ) : (
                        <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-700 group-hover:text-[#AA8038]">{att.fileName}</p>
                        <p className="text-xs text-slate-400">{formatFileSize(att.fileSize)} · {att.mimeType}</p>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">{formatDate(att.createdAt)}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
