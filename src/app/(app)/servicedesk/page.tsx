
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Eye,
  Headphones,
  ImagePlus,
  Link2,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Smile,
  Sparkles,
  TicketCheck,
  UserCheck,
  UserX,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ServiceCategory = { id: string; name: string; groupId: string };
type ServiceGroup = { id: string; name: string; categories: ServiceCategory[]; _count?: { requests: number } };
type ServiceRequest = {
  id: string;
  title: string;
  description: string;
  status: "open" | "pending" | "closed";
  priority: "high" | "normal" | "low";
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  commentsCount?: number;
  group: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  requester: { id: string; name: string; fullname: string } | null;
  assignee: { id: string; name: string; fullname: string } | null;
  organization: { id: string; name: string } | null;
};
type ServiceComment = {
  id: string;
  content: string;
  isSystem?: boolean;
  createdAt: string;
  author: { id: string; name: string; fullname: string; photoUrl?: string | null } | null;
};
type ServiceRequestDetails = ServiceRequest & { comments: ServiceComment[] };
type TeamUser = { id: string; name: string; fullname: string; email: string };
type AiReply = { reply: string; followUps: string[]; confidence: "high" | "medium" | "low"; fallback: boolean };
type UploadedAsset = { id: string; fileName: string; fileUrl: string; fileSize: number; mimeType: string; isImage: boolean };

const STATUS_CONFIG: Record<ServiceRequest["status"], { label: string; className: string }> = {
  open: { label: "Open", className: "bg-red-100 text-[#C78100]" },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-700" },
};

const PRIORITY_CONFIG: Record<ServiceRequest["priority"], { label: string; className: string }> = {
  high: { label: "High", className: "bg-red-100 text-[#C78100]" },
  normal: { label: "Normal", className: "bg-orange-100 text-orange-800" },
  low: { label: "Low", className: "bg-slate-100 text-slate-700" },
};

function displayName(user?: { fullname?: string | null; name?: string | null } | null) {
  return user?.fullname || user?.name || "Unknown";
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

type EmojiCategoryId = "recent" | "smileys" | "people" | "nature" | "food" | "travel" | "activity" | "symbols";

const EMOJI_CATEGORY_ITEMS: Array<{ id: EmojiCategoryId; label: string; icon: string }> = [
  { id: "recent", label: "Recent", icon: "\u{1F551}" },
  { id: "smileys", label: "Smileys", icon: "\u{1F603}" },
  { id: "people", label: "People", icon: "\u{1F64B}" },
  { id: "nature", label: "Nature", icon: "\u{1F98B}" },
  { id: "food", label: "Food", icon: "\u{2615}" },
  { id: "travel", label: "Travel", icon: "\u{1F3E2}" },
  { id: "activity", label: "Activity", icon: "\u{1F3C6}" },
  { id: "symbols", label: "Symbols", icon: "\u{1F4A1}" },
];

function buildEmojiSet(ranges: Array<[number, number]>, extras: string[] = []): string[] {
  const result = new Set<string>(extras);
  const emojiPattern = /\p{Extended_Pictographic}/u;

  for (const [start, end] of ranges) {
    for (let code = start; code <= end; code++) {
      const glyph = String.fromCodePoint(code);
      if (!emojiPattern.test(glyph)) continue;
      result.add(glyph);
    }
  }

  return Array.from(result);
}

const EMOJI_LIBRARY: Record<Exclude<EmojiCategoryId, "recent">, string[]> = {
  smileys: buildEmojiSet(
    [
      [0x1f600, 0x1f64f],
      [0x1f910, 0x1f92f],
      [0x1f970, 0x1f97f],
      [0x1fae0, 0x1fae8],
    ],
    ["\u{1F970}", "\u{1F60D}", "\u{1F44B}"]
  ),
  people: buildEmojiSet(
    [
      [0x1f440, 0x1f487],
      [0x1f575, 0x1f64f],
      [0x1f90c, 0x1f93a],
      [0x1f9b0, 0x1f9e6],
      [0x1faf0, 0x1faf8],
    ],
    ["\u{1F91D}", "\u{1F44D}", "\u{1F64F}"]
  ),
  nature: buildEmojiSet(
    [
      [0x1f300, 0x1f320],
      [0x1f330, 0x1f37c],
      [0x1f400, 0x1f43e],
      [0x1f980, 0x1f9a2],
    ],
    ["\u{1F98B}", "\u{1F33F}", "\u{1F31E}"]
  ),
  food: buildEmojiSet(
    [
      [0x1f32d, 0x1f37f],
      [0x1f950, 0x1f96f],
      [0x1fad0, 0x1fadb],
    ],
    ["\u{2615}", "\u{1F37A}", "\u{1F355}"]
  ),
  travel: buildEmojiSet(
    [
      [0x1f680, 0x1f6ff],
      [0x1f300, 0x1f321],
      [0x1f5fa, 0x1f5ff],
    ],
    ["\u{1F6EB}", "\u{1F697}", "\u{1F3E2}"]
  ),
  activity: buildEmojiSet(
    [
      [0x1f380, 0x1f3ff],
      [0x1f93a, 0x1f94f],
      [0x1f9e9, 0x1f9ef],
    ],
    ["\u{1F3C6}", "\u{1F3AF}", "\u{1F3AE}"]
  ),
  symbols: buildEmojiSet(
    [
      [0x2600, 0x26ff],
      [0x2700, 0x27bf],
      [0x1f4a0, 0x1f4ff],
      [0x1f500, 0x1f53d],
    ],
    ["\u{2764}\u{FE0F}", "\u{1F4A1}", "\u{1F6A9}"]
  ),
};

function isHttpUrl(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isCommentAssetUrl(value: string): boolean {
  const candidate = value.trim();
  return candidate.startsWith("/uploads/") || isHttpUrl(candidate);
}

function renderBareUrls(segment: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const urlRegex = /((?:https?:\/\/|\/uploads\/)[^\s]+)/g;
  let lastIndex = 0;
  let index = 0;
  let match: RegExpExecArray | null = null;

  while ((match = urlRegex.exec(segment)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(segment.slice(lastIndex, match.index));
    }
    const url = match[1];
    nodes.push(
      <a
        key={`${keyPrefix}-u-${index}`}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-[#C78100] underline break-all"
      >
        {url}
      </a>
    );
    lastIndex = match.index + match[0].length;
    index += 1;
  }

  if (lastIndex < segment.length) {
    nodes.push(segment.slice(lastIndex));
  }
  return nodes;
}

function renderInlineRichText(line: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let index = 0;
  let match: RegExpExecArray | null = null;

  while ((match = markdownLinkRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...renderBareUrls(line.slice(lastIndex, match.index), `${keyPrefix}-t-${index}`));
    }
    const label = match[1];
    const url = match[2];
    if (isCommentAssetUrl(url)) {
      nodes.push(
        <a
          key={`${keyPrefix}-md-${index}`}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[#C78100] underline break-all"
        >
          {label}
        </a>
      );
    } else {
      nodes.push(match[0]);
    }
    lastIndex = match.index + match[0].length;
    index += 1;
  }

  if (lastIndex < line.length) {
    nodes.push(...renderBareUrls(line.slice(lastIndex), `${keyPrefix}-tail`));
  }
  return nodes;
}

function renderCommentContent(content: string, keyPrefix: string): ReactNode {
  const lines = content.split(/\r?\n/);
  return (
    <div className="mt-1 space-y-2 text-sm text-slate-700">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={`${keyPrefix}-empty-${index}`} className="h-2" />;

        const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imageMatch && isCommentAssetUrl(imageMatch[2])) {
          const alt = imageMatch[1] || "Attachment image";
          const url = imageMatch[2];
          return (
            <div key={`${keyPrefix}-img-${index}`} className="space-y-1">
              <a href={url} target="_blank" rel="noreferrer noopener" className="block max-w-full">
                <img
                  src={url}
                  alt={alt}
                  className="max-h-56 w-auto max-w-full rounded-md border object-contain bg-slate-100"
                />
              </a>
              <p className="text-xs text-slate-500">{alt}</p>
            </div>
          );
        }

        return (
          <p key={`${keyPrefix}-line-${index}`} className="whitespace-pre-wrap break-words">
            {renderInlineRichText(line, `${keyPrefix}-${index}`)}
          </p>
        );
      })}
    </div>
  );
}

type CreateRequestDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (request: ServiceRequest) => void;
  groups: ServiceGroup[];
  users: TeamUser[];
};

function CreateRequestDialog({ open, onClose, onCreated, groups, users }: CreateRequestDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [groupId, setGroupId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<ServiceRequest["priority"]>("normal");
  const [assigneeId, setAssigneeId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!groupId && groups.length > 0) {
      setGroupId(groups[0].id);
      setCategoryId("");
    }
  }, [open, groups, groupId]);

  const categories = useMemo(() => groups.find((group) => group.id === groupId)?.categories ?? [], [groups, groupId]);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    const safeTitle = title.trim();
    const safeDescription = description.trim();
    if (!safeTitle || !safeDescription) {
      toast.error("Title and description are required");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/servicedesk/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: safeTitle,
          description: safeDescription,
          groupId: groupId || undefined,
          categoryId: categoryId || undefined,
          priority,
          assigneeId: assigneeId || undefined,
          organizationId: organizationId.trim() || undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as ServiceRequest | { error?: string } | null;
      if (!response.ok) {
        throw new Error((data as { error?: string } | null)?.error ?? "Failed to create request");
      }

      onCreated(data as ServiceRequest);
      setTitle("");
      setDescription("");
      setCategoryId("");
      setPriority("normal");
      setAssigneeId("");
      setOrganizationId("");
      toast.success("Request created");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Ticket</DialogTitle>
          <DialogDescription>Capture issue details, assign owner, and track responses.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submitRequest(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sd-title">Title</Label>
            <Input id="sd-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is the issue?" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sd-description">Description</Label>
            <Textarea id="sd-description" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add context, impact, and details" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Group</Label>
              <Select value={groupId || "none"} onValueChange={(value) => { const normalized = value ?? "none"; const nextGroup = normalized === "none" ? "" : normalized; setGroupId(nextGroup); setCategoryId(""); }} items={{ "none": "No group", ...Object.fromEntries(groups.map((group) => [group.id, group.name])) }}>
                <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No group</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId || "none"} onValueChange={(value) => { const normalized = value ?? "none"; setCategoryId(normalized === "none" ? "" : normalized); }} items={{ "none": "No category", ...Object.fromEntries(categories.map((category) => [category.id, category.name])) }}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as ServiceRequest["priority"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Assignee</Label>
              <Select value={assigneeId || "unassigned"} onValueChange={(value) => { const normalized = value ?? "unassigned"; setAssigneeId(normalized === "unassigned" ? "" : normalized); }} items={{ "unassigned": "Unassigned", ...Object.fromEntries(users.map((user) => [user.id, displayName(user)])) }}>
                <SelectTrigger><SelectValue placeholder="Assign to" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>{displayName(user)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sd-org">Organization ID (Optional)</Label>
            <Input id="sd-org" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} placeholder="Paste organization id" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting} style={{ backgroundColor: "#AA8038", color: "#fff" }}>{submitting ? "Creating..." : "Create Request"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type RequestDetailsDialogProps = {
  requestId: string | null;
  open: boolean;
  users: TeamUser[];
  onClose: () => void;
  onRequestChanged: (request: ServiceRequest) => void;
};

function RequestDetailsDialog({ requestId, open, users, onClose, onRequestChanged }: RequestDetailsDialogProps) {
  const [request, setRequest] = useState<ServiceRequestDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [metaComment, setMetaComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [generatingReply, setGeneratingReply] = useState(false);
  const [status, setStatus] = useState<ServiceRequest["status"]>("open");
  const [priority, setPriority] = useState<ServiceRequest["priority"]>("normal");
  const [assigneeId, setAssigneeId] = useState("");
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [showImagePopover, setShowImagePopover] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [emojiSearch, setEmojiSearch] = useState("");
  const [emojiCategory, setEmojiCategory] = useState<EmojiCategoryId>("recent");
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const linkPopoverRef = useRef<HTMLDivElement | null>(null);
  const imagePopoverRef = useRef<HTMLDivElement | null>(null);
  const emojiPopoverRef = useRef<HTMLDivElement | null>(null);

  const loadDetails = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/servicedesk/${requestId}`, { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as ServiceRequestDetails | { error?: string } | null;
      if (!response.ok) throw new Error((data as { error?: string } | null)?.error ?? "Failed to load request");
      const details = data as ServiceRequestDetails;
      setRequest(details);
      setStatus(details.status);
      setPriority(details.priority);
      setAssigneeId(details.assignee?.id ?? "");
      setMetaComment("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load request");
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    if (!open || !requestId) return;
    void loadDetails();
  }, [open, requestId, loadDetails]);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = window.localStorage.getItem("devotiondash_recent_emojis_v1");
      if (!raw) {
        setRecentEmojis([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setRecentEmojis(parsed.filter((item) => typeof item === "string").slice(0, 24));
    } catch {
      setRecentEmojis([]);
    }
  }, [open]);

  useEffect(() => {
    if (!showLinkPopover && !showImagePopover && !showEmojiPicker) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const inLink = linkPopoverRef.current?.contains(target);
      const inImage = imagePopoverRef.current?.contains(target);
      const inEmoji = emojiPopoverRef.current?.contains(target);
      if (inLink || inImage || inEmoji) return;
      setShowLinkPopover(false);
      setShowImagePopover(false);
      setShowEmojiPicker(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showLinkPopover, showImagePopover, showEmojiPicker]);

  const emojiPool = useMemo(() => {
    const source = emojiCategory === "recent" ? recentEmojis : EMOJI_LIBRARY[emojiCategory];
    const query = emojiSearch.trim().toLowerCase();
    if (!query) return source.slice(0, 320);
    return source.filter((emoji) => emoji.toLowerCase().includes(query)).slice(0, 320);
  }, [emojiCategory, emojiSearch, recentEmojis]);

  function insertIntoComment(snippet: string) {
    const element = composerRef.current;
    if (!element) {
      setComment((prev) => `${prev}${snippet}`);
      return;
    }
    const start = element.selectionStart ?? comment.length;
    const end = element.selectionEnd ?? comment.length;
    setComment((prev) => `${prev.slice(0, start)}${snippet}${prev.slice(end)}`);
    const cursor = start + snippet.length;
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(cursor, cursor);
    });
  }

  function addEmojiToComment(emoji: string) {
    insertIntoComment(emoji);
    const next = [emoji, ...recentEmojis.filter((entry) => entry !== emoji)].slice(0, 24);
    setRecentEmojis(next);
    try {
      window.localStorage.setItem("devotiondash_recent_emojis_v1", JSON.stringify(next));
    } catch {
      // no-op
    }
  }

  function appendCommentLines(lines: string[]) {
    if (lines.length === 0) return;
    const prefix = comment && !comment.endsWith("\n") ? "\n" : "";
    const suffix = comment.endsWith("\n") ? "" : "\n";
    insertIntoComment(`${prefix}${lines.join("\n")}${suffix}`);
  }

  async function uploadAssets(files: File[], forceImageMarkdown = false) {
    if (!request || files.length === 0) return;
    setUploadingFiles(true);
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }
      const response = await fetch(`/api/servicedesk/${request.id}/uploads`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as { files?: UploadedAsset[]; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to upload attachment");
      const uploaded = payload?.files ?? [];
      if (uploaded.length === 0) {
        toast.error("No files uploaded");
        return;
      }
      const lines = uploaded.map((item) =>
        forceImageMarkdown || item.isImage ? `![${item.fileName}](${item.fileUrl})` : `[${item.fileName}](${item.fileUrl})`
      );
      appendCommentLines(lines);
      toast.success(`${uploaded.length} attachment${uploaded.length > 1 ? "s" : ""} added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload attachment");
    } finally {
      setUploadingFiles(false);
    }
  }

  async function onAttachmentInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.currentTarget.value = "";
    if (files.length === 0) return;
    await uploadAssets(files, false);
  }

  async function onImageInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.currentTarget.value = "";
    if (files.length === 0) return;
    await uploadAssets(files, true);
  }

  function applyLinkInsert() {
    const safeUrl = linkUrl.trim();
    const safeLabel = linkLabel.trim() || safeUrl;
    if (!isCommentAssetUrl(safeUrl)) {
      toast.error("Enter a valid link URL");
      return;
    }
    insertIntoComment(`[${safeLabel}](${safeUrl})`);
    setLinkLabel("");
    setLinkUrl("");
    setShowLinkPopover(false);
  }

  function applyImageInsert() {
    const safeUrl = imageUrl.trim();
    const safeAlt = imageAlt.trim() || "image";
    if (!isCommentAssetUrl(safeUrl)) {
      toast.error("Enter a valid image URL");
      return;
    }
    insertIntoComment(`![${safeAlt}](${safeUrl})`);
    setImageAlt("");
    setImageUrl("");
    setShowImagePopover(false);
  }

  async function saveMeta() {
    if (!request) return;
    const statusChanged = status !== request.status;
    const safeMetaComment = metaComment.trim();
    if (statusChanged && !safeMetaComment) {
      toast.error("Please add a status note when changing ticket status.");
      return;
    }

    setSavingMeta(true);
    try {
      const response = await fetch(`/api/servicedesk/${request.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          priority,
          assigneeId: assigneeId || null,
          comment: safeMetaComment || undefined,
        }),
      });
      const data = (await response.json().catch(() => null)) as ServiceRequestDetails | { error?: string } | null;
      if (!response.ok) throw new Error((data as { error?: string } | null)?.error ?? "Failed to update request");
      const updated = data as ServiceRequestDetails;
      setRequest(updated);
      setMetaComment("");
      onRequestChanged(updated);
      toast.success("Request updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update request");
    } finally {
      setSavingMeta(false);
    }
  }

  async function sendComment() {
    if (!request || !comment.trim()) return;
    setSavingComment(true);
    try {
      const response = await fetch(`/api/servicedesk/${request.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment.trim() }),
      });
      const data = (await response.json().catch(() => null)) as ServiceComment | { error?: string } | null;
      if (!response.ok) throw new Error((data as { error?: string } | null)?.error ?? "Failed to add comment");

      const created = data as ServiceComment;
      setRequest((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          comments: [...prev.comments, created],
          commentsCount: (prev.commentsCount ?? prev.comments.length) + 1,
          updatedAt: new Date().toISOString(),
        };
        onRequestChanged(next);
        return next;
      });
      setComment("");
      setShowEmojiPicker(false);
      setShowImagePopover(false);
      setShowLinkPopover(false);
      toast.success("Comment sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add comment");
    } finally {
      setSavingComment(false);
    }
  }

  async function generateAiReply(autoSend: boolean) {
    if (!request) return;
    setGeneratingReply(true);
    try {
      const response = await fetch(`/api/servicedesk/${request.id}/ai-reply`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as AiReply | { error?: string } | null;
      if (!response.ok) throw new Error((data as { error?: string } | null)?.error ?? "Failed to generate AI reply");

      const ai = data as AiReply;
      if (!ai.reply?.trim()) throw new Error("AI reply was empty");

      if (!autoSend) {
        setComment(ai.reply);
        toast.success(ai.fallback ? "Drafted reply (fallback)" : "AI reply drafted");
      } else {
        const responseSend = await fetch(`/api/servicedesk/${request.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: ai.reply.trim() }),
        });
        const sendData = (await responseSend.json().catch(() => null)) as ServiceComment | { error?: string } | null;
        if (!responseSend.ok) throw new Error((sendData as { error?: string } | null)?.error ?? "Failed to send AI reply");

        const created = sendData as ServiceComment;
        setRequest((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            comments: [...prev.comments, created],
            commentsCount: (prev.commentsCount ?? prev.comments.length) + 1,
            updatedAt: new Date().toISOString(),
          };
          onRequestChanged(next);
          return next;
        });
        setComment("");
        toast.success("AI reply sent");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate AI reply");
    } finally {
      setGeneratingReply(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(96vw,1200px)] max-w-[1200px] h-[88vh] p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 py-3 border-b bg-white">
          <DialogTitle className="text-base leading-tight">{request?.title || "Request details"}</DialogTitle>
          <DialogDescription className="text-xs">
            Focused ticket workspace with compact controls and longer conversation area.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="p-5 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !request ? (
          <div className="p-5 text-sm text-slate-500">Request not found.</div>
        ) : (
          <div className="min-h-0 flex-1 grid grid-cols-1 md:grid-cols-[320px_1fr]">
            <aside className="border-r bg-[#FFFEFD] p-4 space-y-3 overflow-y-auto">
              <div className="flex items-center flex-wrap gap-1.5">
                <Badge className={cn("h-5 px-2 text-[11px]", STATUS_CONFIG[request.status].className)}>
                  {STATUS_CONFIG[request.status].label}
                </Badge>
                <Badge className={cn("h-5 px-2 text-[11px]", PRIORITY_CONFIG[request.priority].className)}>
                  {PRIORITY_CONFIG[request.priority].label}
                </Badge>
                {request.group?.name ? (
                  <Badge variant="secondary" className="h-5 px-2 text-[10px]">{request.group.name}</Badge>
                ) : null}
                {request.category?.name ? (
                  <Badge variant="secondary" className="h-5 px-2 text-[10px]">{request.category.name}</Badge>
                ) : null}
              </div>

              <div className="rounded-md border bg-white px-3 py-2">
                <p className="text-xs text-slate-500">Ticket ID</p>
                <p className="mt-0.5 font-mono text-xs text-[#C78100]">#{request.id.slice(0, 8)}</p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</p>
                <p className="rounded-md border bg-white px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap">
                  {request.description}
                </p>
              </div>

              <div className="grid gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Status</Label>
                  <Select value={status} onValueChange={(value) => setStatus(value as ServiceRequest["status"])}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Priority</Label>
                  <Select value={priority} onValueChange={(value) => setPriority(value as ServiceRequest["priority"])}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Assignee</Label>
                  <Select
                    value={assigneeId || "unassigned"}
                    onValueChange={(value) => {
                      const normalized = value ?? "unassigned";
                      setAssigneeId(normalized === "unassigned" ? "" : normalized);
                    }}
                    items={{ "unassigned": "Unassigned", ...Object.fromEntries(users.map((user) => [user.id, displayName(user)])) }}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>{displayName(user)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5 rounded-md border bg-white p-3 text-xs text-slate-600">
                <p><span className="text-slate-500">Requester:</span> {displayName(request.requester)}</p>
                <p><span className="text-slate-500">Assignee:</span> {displayName(request.assignee)}</p>
                <p><span className="text-slate-500">Updated:</span> {formatDate(request.updatedAt)}</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-500">
                  Status note {status !== request.status ? "*" : "(optional)"}
                </Label>
                <Textarea
                  rows={3}
                  className="min-h-[78px] resize-none text-sm"
                  value={metaComment}
                  onChange={(e) => setMetaComment(e.target.value)}
                  placeholder={
                    status !== request.status
                      ? "Required: add reason for status change"
                      : "Add an internal note for this update"
                  }
                />
              </div>

              <Button
                className="w-full h-9"
                onClick={() => void saveMeta()}
                disabled={savingMeta}
                style={{ backgroundColor: "#AA8038", color: "#fff" }}
              >
                {savingMeta ? "Saving..." : "Save Changes"}
              </Button>
            </aside>

            <section className="min-h-0 flex flex-col bg-slate-50">
              <div className="border-b bg-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Conversation ({request.comments.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={generatingReply}
                    onClick={() => void generateAiReply(false)}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    {generatingReply ? "Generating..." : "AI Draft Reply"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={generatingReply || savingComment}
                    onClick={() => void generateAiReply(true)}
                  >
                    <Bot className="mr-1.5 h-3.5 w-3.5" />
                    AI Auto Reply
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                {request.comments.length === 0 ? (
                  <p className="text-sm text-slate-400">No comments yet.</p>
                ) : (
                  request.comments.map((item) => {
                    const author = displayName(item.author);
                    return (
                      <div key={item.id} className="flex gap-2 rounded-lg border bg-white p-2.5">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarFallback className="text-xs bg-red-50 text-[#C78100]">{initials(author)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="font-medium text-slate-700">{author}</span>
                            <span>{formatDate(item.createdAt)}</span>
                            {item.isSystem ? <Badge variant="secondary" className="text-[10px]">System</Badge> : null}
                          </div>
                          {renderCommentContent(item.content, item.id)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t bg-white px-4 py-3 space-y-2">
                <div className="relative rounded-md border bg-white shadow-sm">
                  <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
                    <button
                      className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs text-slate-600 hover:bg-slate-100"
                      onClick={() => attachmentInputRef.current?.click()}
                      disabled={uploadingFiles || savingComment}
                      title="Attach files"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      Attach
                    </button>

                    <div className="relative" ref={imagePopoverRef}>
                      <button
                        className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs text-slate-600 hover:bg-slate-100"
                        onClick={() => {
                          setShowImagePopover((prev) => !prev);
                          setShowLinkPopover(false);
                          setShowEmojiPicker(false);
                        }}
                        disabled={savingComment}
                        title="Insert image"
                      >
                        <ImagePlus className="h-3.5 w-3.5" />
                        Image
                      </button>
                      {showImagePopover ? (
                        <div className="absolute left-0 top-9 z-30 w-72 rounded-lg border bg-white p-3 shadow-xl">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Insert Image</p>
                          <Input
                            className="mb-2 h-8 text-xs"
                            placeholder="Alt text"
                            value={imageAlt}
                            onChange={(e) => setImageAlt(e.target.value)}
                          />
                          <Input
                            className="mb-2 h-8 text-xs"
                            placeholder="https://example.com/image.png"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                          />
                          <div className="flex items-center justify-between gap-2">
                            <button
                              className="rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                              onClick={() => imageUploadInputRef.current?.click()}
                              disabled={uploadingFiles}
                            >
                              Upload image
                            </button>
                            <button
                              className="rounded bg-[#AA8038] px-2 py-1 text-xs text-white hover:bg-[#D08700]"
                              onClick={applyImageInsert}
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="relative" ref={linkPopoverRef}>
                      <button
                        className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs text-slate-600 hover:bg-slate-100"
                        onClick={() => {
                          setShowLinkPopover((prev) => !prev);
                          setShowImagePopover(false);
                          setShowEmojiPicker(false);
                        }}
                        disabled={savingComment}
                        title="Insert link"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Link
                      </button>
                      {showLinkPopover ? (
                        <div className="absolute left-0 top-9 z-30 w-72 rounded-lg border bg-white p-3 shadow-xl">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Insert Link</p>
                          <Input
                            className="mb-2 h-8 text-xs"
                            placeholder="Label"
                            value={linkLabel}
                            onChange={(e) => setLinkLabel(e.target.value)}
                          />
                          <Input
                            className="mb-2 h-8 text-xs"
                            placeholder="https://example.com"
                            value={linkUrl}
                            onChange={(e) => setLinkUrl(e.target.value)}
                          />
                          <div className="flex justify-end">
                            <button
                              className="rounded bg-[#AA8038] px-2 py-1 text-xs text-white hover:bg-[#D08700]"
                              onClick={applyLinkInsert}
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="relative" ref={emojiPopoverRef}>
                      <button
                        className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs text-slate-600 hover:bg-slate-100"
                        onClick={() => {
                          setShowEmojiPicker((prev) => !prev);
                          setShowImagePopover(false);
                          setShowLinkPopover(false);
                        }}
                        disabled={savingComment}
                        title="Insert emoji"
                      >
                        <Smile className="h-3.5 w-3.5" />
                        Emoji
                      </button>
                      {showEmojiPicker ? (
                        <div className="absolute left-0 top-9 z-30 w-[min(92vw,380px)] rounded-lg border bg-white p-3 shadow-xl">
                          <Input
                            className="mb-2 h-8 text-xs"
                            placeholder="Search emoji"
                            value={emojiSearch}
                            onChange={(e) => setEmojiSearch(e.target.value)}
                          />
                          <div className="mb-2 flex flex-wrap gap-1">
                            {EMOJI_CATEGORY_ITEMS.map((item) => (
                              <button
                                key={item.id}
                                className={cn(
                                  "rounded px-2 py-1 text-xs",
                                  emojiCategory === item.id ? "bg-[#AA8038]/10 text-[#C78100]" : "text-slate-500 hover:bg-slate-100"
                                )}
                                onClick={() => setEmojiCategory(item.id)}
                              >
                                <span className="mr-1">{item.icon}</span>
                                {item.label}
                              </button>
                            ))}
                          </div>
                          <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto rounded border p-1">
                            {emojiPool.map((emoji) => (
                              <button
                                key={`sd-emoji-${emoji}`}
                                className="rounded p-1 text-lg leading-none hover:bg-slate-100"
                                onClick={() => addEmojiToComment(emoji)}
                                title={emoji}
                              >
                                {emoji}
                              </button>
                            ))}
                            {emojiPool.length === 0 ? (
                              <p className="col-span-8 py-3 text-center text-xs text-slate-400">No emoji found.</p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <Textarea
                    ref={composerRef}
                    rows={5}
                    className="min-h-[120px] max-h-56 resize-y overflow-y-auto border-0 focus-visible:ring-0"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Write an update. You can add links, images, files, and emoji."
                  />
                </div>

                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => void onAttachmentInputChange(e)}
                />
                <input
                  ref={imageUploadInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void onImageInputChange(e)}
                />

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Use markdown: <code>[label](url)</code> and <code>![alt](image-url)</code>
                  </p>
                  <Button
                    size="sm"
                    className="h-9 px-4"
                    disabled={savingComment || uploadingFiles || !comment.trim()}
                    onClick={() => void sendComment()}
                    style={{ backgroundColor: "#AA8038", color: "#fff" }}
                  >
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    {savingComment ? "Sending..." : uploadingFiles ? "Uploading..." : "Send Reply"}
                  </Button>
                </div>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ServiceDeskPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [groups, setGroups] = useState<ServiceGroup[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ServiceRequest["status"]>("all");
  const [view, setView] = useState<"list" | "board">("list");

  const [createOpen, setCreateOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [requestsRes, groupsRes, usersRes] = await Promise.all([
        fetch("/api/servicedesk/requests?limit=300", { cache: "no-store" }),
        fetch("/api/servicedesk/groups", { cache: "no-store" }),
        fetch("/api/team/users?limit=200&isActive=true", { cache: "no-store" }),
      ]);

      if (!requestsRes.ok) {
        const err = (await requestsRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to load requests");
      }
      if (!groupsRes.ok) {
        const err = (await groupsRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to load groups");
      }

      const requestsData = (await requestsRes.json()) as ServiceRequest[];
      const groupsData = (await groupsRes.json()) as ServiceGroup[];
      setRequests(Array.isArray(requestsData) ? requestsData : []);
      setGroups(Array.isArray(groupsData) ? groupsData : []);

      if (usersRes.ok) {
        const usersData = (await usersRes.json()) as TeamUser[];
        setUsers(Array.isArray(usersData) ? usersData : []);
      } else {
        setUsers([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load ticket desk");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const totalOpen = useMemo(() => requests.filter((request) => request.status === "open").length, [requests]);
  const totalPending = useMemo(() => requests.filter((request) => request.status === "pending").length, [requests]);
  const totalClosed = useMemo(() => requests.filter((request) => request.status === "closed").length, [requests]);
  const totalHighPriority = useMemo(() => requests.filter((request) => request.priority === "high" && request.status !== "closed").length, [requests]);
  const totalUnassigned = useMemo(() => requests.filter((request) => !request.assignee && request.status !== "closed").length, [requests]);

  const assignedCount = useMemo(() => {
    const me = session?.user?.id;
    if (!me) return 0;
    return requests.filter((request) => request.assignee?.id === me && request.status !== "closed").length;
  }, [requests, session?.user?.id]);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const me = session?.user?.id;

    return requests.filter((request) => {
      const scopeMatch = (() => {
        if (scopeFilter === "all") return true;
        if (scopeFilter === "assigned") return Boolean(me && request.assignee?.id === me);
        if (scopeFilter === "monitoring") return request.status !== "closed";
        if (scopeFilter.startsWith("group:")) return request.group?.id === scopeFilter.replace("group:", "");
        return true;
      })();

      if (!scopeMatch) return false;
      if (statusFilter !== "all" && request.status !== statusFilter) return false;

      if (!q) return true;
      const haystack = [request.id, request.title, request.description, displayName(request.requester), displayName(request.assignee), request.group?.name ?? "", request.category?.name ?? ""]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [requests, scopeFilter, statusFilter, searchQuery, session?.user?.id]);

  const groupItems = useMemo(() => groups.map((group) => ({ id: group.id, name: group.name, count: requests.filter((request) => request.group?.id === group.id).length })), [groups, requests]);

  function handleRequestCreated(request: ServiceRequest) {
    setRequests((prev) => [request, ...prev]);
  }

  function handleRequestChanged(request: ServiceRequest) {
    setRequests((prev) => prev.map((item) => (item.id === request.id ? { ...item, ...request } : item)));
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-60 shrink-0 border-r bg-white p-3">
        <div className="mb-3 px-2"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ticket Desk</p></div>

        <div className="space-y-1">
          <button onClick={() => setScopeFilter("all")} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-sm", scopeFilter === "all" ? "bg-[#AA8038]/10 text-[#AA8038]" : "text-slate-600 hover:bg-slate-100")}>
            <span className="flex items-center gap-2"><Headphones className="h-4 w-4" />All Tickets</span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs">{requests.length}</span>
          </button>

          <button onClick={() => setScopeFilter("assigned")} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-sm", scopeFilter === "assigned" ? "bg-[#AA8038]/10 text-[#AA8038]" : "text-slate-600 hover:bg-slate-100")}>
            <span className="flex items-center gap-2"><UserCheck className="h-4 w-4" />Assigned To Me</span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs">{assignedCount}</span>
          </button>

          <button onClick={() => setScopeFilter("monitoring")} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-sm", scopeFilter === "monitoring" ? "bg-[#AA8038]/10 text-[#AA8038]" : "text-slate-600 hover:bg-slate-100")}>
            <span className="flex items-center gap-2"><Eye className="h-4 w-4" />Active Monitoring</span>
          </button>
        </div>

        <div className="my-3 border-t" />

        <div className="space-y-1">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Groups</p>
          {groupItems.map((group) => {
            const key = `group:${group.id}`;
            return (
              <button key={group.id} onClick={() => setScopeFilter(key)} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-sm", scopeFilter === key ? "bg-[#AA8038]/10 text-[#AA8038]" : "text-slate-600 hover:bg-slate-100")}>
                <span className="truncate">{group.name}</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs">{group.count}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b bg-white px-5 pt-4 pb-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TicketCheck className="h-5 w-5 text-[#AA8038]" />
              <span className="text-base font-semibold text-slate-800">Ticket Desk</span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setCreateOpen(true)} style={{ backgroundColor: "#AA8038", color: "#fff" }}><Plus className="mr-1.5 h-4 w-4" />New Ticket</Button>
              <Button variant="outline" size="icon" onClick={() => void loadData()} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <button onClick={() => { setScopeFilter("all"); setStatusFilter("open"); }} className={cn("rounded-lg border px-3 py-2 text-left transition-colors hover:bg-[#FFFCF5]", statusFilter === "open" && scopeFilter === "all" ? "border-[#AA8038]/30 bg-[#FFFCF5]" : "bg-white")}>
              <div className="flex items-center gap-1.5 mb-1"><div className="h-2 w-2 rounded-full bg-[#AA8038]" /><span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Open</span></div>
              <p className="text-2xl font-bold text-[#C78100]">{totalOpen}</p>
            </button>
            <button onClick={() => { setScopeFilter("all"); setStatusFilter("pending"); }} className={cn("rounded-lg border px-3 py-2 text-left transition-colors hover:bg-amber-50", statusFilter === "pending" && scopeFilter === "all" ? "border-amber-300 bg-amber-50" : "bg-white")}>
              <div className="flex items-center gap-1.5 mb-1"><Clock className="h-3.5 w-3.5 text-amber-500" /><span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Pending</span></div>
              <p className="text-2xl font-bold text-amber-700">{totalPending}</p>
            </button>
            <button onClick={() => { setScopeFilter("all"); setStatusFilter("closed"); }} className={cn("rounded-lg border px-3 py-2 text-left transition-colors hover:bg-slate-50", statusFilter === "closed" && scopeFilter === "all" ? "border-slate-300 bg-slate-50" : "bg-white")}>
              <div className="flex items-center gap-1.5 mb-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Closed</span></div>
              <p className="text-2xl font-bold text-slate-700">{totalClosed}</p>
            </button>
            <button onClick={() => { setScopeFilter("all"); setStatusFilter("all"); }} className="rounded-lg border bg-white px-3 py-2 text-left transition-colors hover:bg-orange-50">
              <div className="flex items-center gap-1.5 mb-1"><AlertTriangle className="h-3.5 w-3.5 text-orange-500" /><span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">High Priority</span></div>
              <p className="text-2xl font-bold text-orange-600">{totalHighPriority}</p>
            </button>
            <button onClick={() => { setScopeFilter("all"); setStatusFilter("all"); }} className="rounded-lg border bg-white px-3 py-2 text-left transition-colors hover:bg-slate-50">
              <div className="flex items-center gap-1.5 mb-1"><UserX className="h-3.5 w-3.5 text-slate-400" /><span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Unassigned</span></div>
              <p className="text-2xl font-bold text-slate-500">{totalUnassigned}</p>
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-xs"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-8" placeholder="Search tickets…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <span className="ml-auto text-xs text-slate-400">{filteredRequests.length} of {requests.length} tickets</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50">
          {loading ? (
            <div className="space-y-2 p-5">{Array.from({ length: 8 }).map((_, idx) => (<Skeleton key={idx} className="h-10 w-full" />))}</div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-16 text-center text-slate-400"><MessageSquare className="mx-auto mb-2 h-10 w-10 opacity-35" /><p className="text-sm">No tickets found for this filter.</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-10 bg-white">
                  <TableHead className="pl-5 w-24">ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-32">Group</TableHead>
                  <TableHead className="w-32">Requester</TableHead>
                  <TableHead className="w-32">Assignee</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-24">Priority</TableHead>
                  <TableHead className="w-32">Comments</TableHead>
                  <TableHead className="w-36 pr-5">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id} onClick={() => { setActiveRequestId(request.id); setDetailsOpen(true); }} className="cursor-pointer bg-white hover:bg-[#FFFCF5]/60">
                    <TableCell className="pl-5 text-xs font-mono text-[#C78100]">#{request.id.slice(0, 8)}</TableCell>
                    <TableCell><p className="max-w-[460px] truncate text-sm font-medium text-slate-800">{request.title}</p><p className="max-w-[460px] truncate text-xs text-slate-500">{request.category?.name ?? "General"}</p></TableCell>
                    <TableCell className="text-sm text-slate-600">{request.group?.name ?? "General"}</TableCell>
                    <TableCell className="text-sm text-slate-600">{displayName(request.requester)}</TableCell>
                    <TableCell className="text-sm text-slate-600">{displayName(request.assignee)}</TableCell>
                    <TableCell><Badge className={STATUS_CONFIG[request.status].className}>{STATUS_CONFIG[request.status].label}</Badge></TableCell>
                    <TableCell><Badge className={PRIORITY_CONFIG[request.priority].className}>{PRIORITY_CONFIG[request.priority].label}</Badge></TableCell>
                    <TableCell className="text-sm text-slate-500">{request.commentsCount ?? 0}</TableCell>
                    <TableCell className="pr-5 text-xs text-slate-500">{formatDate(request.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <CreateRequestDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleRequestCreated} groups={groups} users={users} />
      <RequestDetailsDialog requestId={activeRequestId} open={detailsOpen} onClose={() => setDetailsOpen(false)} users={users} onRequestChanged={handleRequestChanged} />
    </div>
  );
}
