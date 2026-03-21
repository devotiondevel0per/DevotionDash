"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LinkifiedMessage } from "@/components/chat/linkified-message";
import { cn } from "@/lib/utils";
import {
  CheckCheck,
  Forward,
  Loader2,
  MessageSquare,
  Mic,
  Paperclip,
  Plus,
  Reply,
  Search,
  Send,
  Smile,
  Trash2,
  Users,
  X,
} from "lucide-react";

type ChatAttachmentKind = "image" | "video" | "audio" | "file";

type ChatAttachmentPayload = {
  id: string;
  kind: ChatAttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  durationSec?: number;
};

type ChatMessagePayload = {
  version: 2;
  type: "text" | "media" | "system" | "deleted";
  text: string;
  attachments: ChatAttachmentPayload[];
  replyTo?: { id: string; text: string; senderName?: string };
  forwardedFrom?: { id: string; senderName?: string };
  seenByUserIds: string[];
  deletedByAdmin?: boolean;
  deletedAt?: string;
};

type ChatUser = {
  id: string;
  name: string;
  fullname: string;
  photoUrl: string | null;
  isActive?: boolean;
  lastActivity?: string | null;
};

type DialogMessage = {
  id: string;
  content: string;
  payload: ChatMessagePayload;
  createdAt: string;
  userId: string;
  user: ChatUser | null;
};

type DialogMember = {
  id: string;
  userId: string;
  user: ChatUser;
};

type DialogSummary = {
  id: string;
  subject: string | null;
  status: string;
  visitorName: string | null;
  group: { id: string; name: string } | null;
  organization: { id: string; name: string } | null;
  members: DialogMember[];
  messages: DialogMessage[];
  updatedAt: string;
};

type DialogDetail = {
  id: string;
  subject: string | null;
  status: string;
  visitorName: string | null;
  group: { id: string; name: string } | null;
  organization: { id: string; name: string } | null;
  members: DialogMember[];
  messages: DialogMessage[];
  updatedAt: string;
};

type ChatGroup = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
};

type TeamUser = {
  id: string;
  name: string;
  fullname: string;
  email: string;
  isActive?: boolean;
  photoUrl?: string | null;
  position?: string;
  department?: string;
  agentStatus?: string;
  workState?: string;
  lastActivity?: string | null;
};

type ComposerAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  kind: ChatAttachmentKind;
  durationSec?: number;
};

type PagedMessagesResponse = {
  items: DialogMessage[];
  hasMore: boolean;
};

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
    for (let code = start; code <= end; code += 1) {
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

const RECENT_EMOJIS_STORAGE_KEY = "teamwox_chat_recent_emojis_v1";

function mergeMessages(existing: DialogMessage[], incoming: DialogMessage[]) {
  const byId = new Map(existing.map((message) => [message.id, message] as const));
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatLastSeen(value: string | null | undefined) {
  if (!value) return "last seen unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "last seen unavailable";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 2) return "online";
  if (mins < 60) return `last seen ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `last seen ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `last seen ${days}d ago`;
}

function isOnline(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= 2 * 60 * 1000;
}

function getUserOnlineColor(user: { agentStatus?: string; lastActivity?: string | null }): "green" | "amber" | "gray" {
  if (user.agentStatus === "online") return "green";
  if (user.agentStatus === "away") return "amber";
  if (user.agentStatus === "offline") return "gray";
  // fallback to lastActivity heuristic
  if (isOnline(user.lastActivity)) return "green";
  return "gray";
}

function inferAttachmentKind(mimeType: string): ChatAttachmentKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

function pickDialogTitle(
  dialog: Pick<DialogSummary, "id" | "subject" | "visitorName" | "organization" | "members">,
  currentUserId?: string
) {
  if (dialog.subject) return dialog.subject;
  if (dialog.visitorName) return dialog.visitorName;
  if (dialog.organization?.name) return dialog.organization.name;
  // For 1:1 dialogs, show the peer's name
  if (dialog.members.length <= 2 && currentUserId) {
    const peer = dialog.members.find(m => m.userId !== currentUserId);
    if (peer) return peer.user.fullname || peer.user.name || "Chat";
  }
  // Fallback: show first member's name or generic
  const firstMember = dialog.members.find(m => m.userId !== currentUserId) ?? dialog.members[0];
  if (firstMember) return firstMember.user.fullname || firstMember.user.name || "Chat";
  return "Chat";
}

function getMessagePreview(message: DialogMessage | undefined) {
  if (!message) return "No messages yet";
  const payload = message.payload;
  if (payload.type === "deleted") return "Message removed by admin";
  if (payload.text.trim()) return payload.text;
  if (payload.attachments.length > 0) {
    if (payload.attachments.length === 1) {
      const kind = payload.attachments[0].kind;
      if (kind === "image") return "Image";
      if (kind === "video") return "Video";
      if (kind === "audio") return "Voice note";
      return "Attachment";
    }
    return `${payload.attachments.length} attachments`;
  }
  return "Message";
}

function displayName(user: ChatUser | null | undefined) {
  if (!user) return "System";
  return user.fullname || user.name || "User";
}

function canonicalDialogSubject(subject: string | null | undefined) {
  const value = subject?.trim() ?? "";
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === "direct" || lower === "direct chat" || lower.startsWith("direct:")) return null;
  return value;
}

function directDialogKey(dialog: DialogSummary) {
  if (dialog.group || dialog.organization || dialog.members.length !== 2) return null;
  const memberIds = Array.from(new Set(dialog.members.map((member) => member.userId))).sort();
  if (memberIds.length !== 2) return null;
  return memberIds.join(":");
}

function directDialogRank(dialog: DialogSummary) {
  let score = dialog.messages.length > 0 ? 4 : 0;
  if (!canonicalDialogSubject(dialog.subject)) score += 2;
  return score;
}

function dedupeDialogs(dialogs: DialogSummary[]) {
  const result: DialogSummary[] = [];
  const directDialogs = new Map<string, DialogSummary>();

  for (const dialog of dialogs) {
    const normalized = canonicalDialogSubject(dialog.subject) === dialog.subject
      ? dialog
      : { ...dialog, subject: canonicalDialogSubject(dialog.subject) };

    const key = directDialogKey(normalized);
    if (!key) {
      result.push(normalized);
      continue;
    }

    const existing = directDialogs.get(key);
    if (!existing || directDialogRank(normalized) > directDialogRank(existing)) {
      directDialogs.set(key, normalized);
    }
  }

  result.push(...directDialogs.values());
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      if (!value) reject(new Error("Unable to read file"));
      else resolve(value);
    };
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function ChatPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();

  const [dialogs, setDialogs] = useState<DialogSummary[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [selectedDialogId, setSelectedDialogId] = useState<string | null>(null);
  const [selectedDialog, setSelectedDialog] = useState<DialogDetail | null>(null);
  const [messages, setMessages] = useState<DialogMessage[]>([]);
  const [loadingDialogs, setLoadingDialogs] = useState(true);
  const [loadingDialogDetail, setLoadingDialogDetail] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [creatingDialog, setCreatingDialog] = useState(false);

  const [activeGroup, setActiveGroup] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [newDialogTitle, setNewDialogTitle] = useState("");
  const [newDialogMemberIds, setNewDialogMemberIds] = useState<string[]>([]);
  const [newDialogGroupId, setNewDialogGroupId] = useState("none");
  const [submittingDialog, setSubmittingDialog] = useState(false);

  const [messageInput, setMessageInput] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState<EmojiCategoryId>("smileys");
  const [emojiSearch, setEmojiSearch] = useState("");
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const emojiPanelRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const latestMessageAtRef = useRef<string | null>(null);

  const [replyTarget, setReplyTarget] = useState<DialogMessage | null>(null);
  const [forwardTarget, setForwardTarget] = useState<DialogMessage | null>(null);
  const [forwardDialogId, setForwardDialogId] = useState<string>("");

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const sendRecordingRef = useRef(true);
  const recordingTimerRef = useRef<number | null>(null);

  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [sidebarTab, setSidebarTab] = useState<"chats" | "people">("chats");
  const [peopleSearch, setPeopleSearch] = useState("");

  const canAdminDelete = Boolean(session?.user?.isAdmin);

  const loadDialogs = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoadingDialogs(true);
    try {
      const response = await fetch("/api/chat/dialogs", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load dialogs");
      const data = (await response.json()) as DialogSummary[];
      const list = dedupeDialogs(Array.isArray(data) ? data : []);
      setDialogs((prev) => {
        if (prev.length !== list.length) return list;
        const same = prev.every((item, index) => {
          const next = list[index];
          return (
            item.id === next.id &&
            item.updatedAt === next.updatedAt &&
            item.messages[0]?.id === next.messages[0]?.id
          );
        });
        return same ? prev : list;
      });
      setSelectedDialogId((prev) => {
        if (!prev) return list[0]?.id ?? null;
        return list.some((item) => item.id === prev) ? prev : (list[0]?.id ?? null);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dialogs");
    } finally {
      if (!options?.silent) setLoadingDialogs(false);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/groups", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load groups");
      const data = (await response.json()) as ChatGroup[];
      setGroups(Array.isArray(data) ? data : []);
    } catch {
      setGroups([]);
    }
  }, []);

  const loadTeamUsers = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/users", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load users");
      const data = (await response.json()) as TeamUser[];
      setTeamUsers(Array.isArray(data) ? data : []);
    } catch {
      setTeamUsers([]);
    }
  }, []);

  const loadDialogDetail = useCallback(async (dialogId: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setLoadingDialogDetail(true);
    try {
      const response = await fetch(`/api/chat/dialogs/${dialogId}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load conversation");
      const data = (await response.json()) as DialogDetail;
      setSelectedDialog(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation");
    } finally {
      if (!options?.silent) setLoadingDialogDetail(false);
    }
  }, []);

  const fetchMessagePage = useCallback(
    async (dialogId: string, options?: { before?: string; after?: string; limit?: number }) => {
      const params = new URLSearchParams();
      params.set("limit", String(options?.limit ?? 40));
      if (options?.before) params.set("before", options.before);
      if (options?.after) params.set("after", options.after);
      const response = await fetch(`/api/chat/dialogs/${dialogId}/messages?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load messages");
      const payload = (await response.json()) as PagedMessagesResponse | DialogMessage[];
      if (Array.isArray(payload)) {
        return { items: payload, hasMore: false };
      }
      return {
        items: Array.isArray(payload.items) ? payload.items : [],
        hasMore: Boolean(payload.hasMore),
      };
    },
    []
  );

  const loadRecentMessages = useCallback(
    async (dialogId: string, options?: { silent?: boolean }) => {
      if (!options?.silent) setLoadingMessages(true);
      try {
        const page = await fetchMessagePage(dialogId, { limit: 40 });
        setMessages(page.items);
        setHasOlderMessages(page.hasMore);
        setSelectedMessageId(null);
        requestAnimationFrame(() => {
          const el = messagesContainerRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load messages");
      } finally {
        if (!options?.silent) setLoadingMessages(false);
      }
    },
    [fetchMessagePage]
  );

  const refreshLatestMessages = useCallback(
    async (dialogId: string) => {
      try {
        const newest = latestMessageAtRef.current;
        const page = await fetchMessagePage(dialogId, {
          limit: 40,
          ...(newest ? { after: newest } : {}),
        });
        if (page.items.length === 0) return;

        const el = messagesContainerRef.current;
        const shouldStickToBottom = Boolean(
          el && el.scrollHeight - el.scrollTop - el.clientHeight < 96
        );

        setMessages((prev) => mergeMessages(prev, page.items));

        if (shouldStickToBottom) {
          requestAnimationFrame(() => {
            const node = messagesContainerRef.current;
            if (node) node.scrollTop = node.scrollHeight;
          });
        }
      } catch {
        // silent on polling
      }
    },
    [fetchMessagePage]
  );

  const loadOlderMessages = useCallback(async () => {
    if (!selectedDialogId || loadingOlderMessages || !hasOlderMessages || messages.length === 0) return;
    const first = messages[0];
    if (!first) return;

    setLoadingOlderMessages(true);
    try {
      const scrollNode = messagesContainerRef.current;
      const previousScrollHeight = scrollNode?.scrollHeight ?? 0;
      const previousScrollTop = scrollNode?.scrollTop ?? 0;

      const page = await fetchMessagePage(selectedDialogId, { before: first.createdAt, limit: 30 });
      setHasOlderMessages(page.hasMore);
      setMessages((prev) => mergeMessages(page.items, prev));

      requestAnimationFrame(() => {
        const node = messagesContainerRef.current;
        if (!node) return;
        const nextScrollHeight = node.scrollHeight;
        node.scrollTop = Math.max(0, nextScrollHeight - previousScrollHeight + previousScrollTop);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load older messages");
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [fetchMessagePage, hasOlderMessages, loadingOlderMessages, messages, selectedDialogId]);

  useEffect(() => {
    void loadDialogs();
    void loadGroups();
    void loadTeamUsers();
  }, [loadDialogs, loadGroups, loadTeamUsers]);

  useEffect(() => {
    const fromQuery = searchParams.get("dialog");
    if (fromQuery) setSelectedDialogId(fromQuery);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedDialogId) {
      setSelectedDialog(null);
      setMessages([]);
      setHasOlderMessages(false);
      return;
    }
    void Promise.all([
      loadDialogDetail(selectedDialogId),
      loadRecentMessages(selectedDialogId),
    ]);
  }, [selectedDialogId, loadDialogDetail, loadRecentMessages]);

  useEffect(() => {
    if (!selectedDialogId) return;
    void fetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link: `/chat?dialog=${selectedDialogId}` }),
    });
  }, [selectedDialogId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadDialogs({ silent: true });
      if (selectedDialogId) {
        void refreshLatestMessages(selectedDialogId);
        // Keep marking the open dialog's notifications as read so the badge stays cleared
        void fetch("/api/notifications", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link: `/chat?dialog=${selectedDialogId}` }),
        });
      }
    }, 3500);
    return () => window.clearInterval(interval);
  }, [loadDialogs, refreshLatestMessages, selectedDialogId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_EMOJIS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      if (!Array.isArray(parsed)) return;
      setRecentEmojis(parsed.filter((value) => typeof value === "string").slice(0, 48));
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (emojiPanelRef.current?.contains(target)) return;
      setShowEmoji(false);
    };
    if (showEmoji) {
      document.addEventListener("pointerdown", onPointerDown);
    }
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [showEmoji]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-message-bubble='true']")) return;
      if (target.closest("[data-message-actions='true']")) return;
      setSelectedMessageId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    latestMessageAtRef.current = messages[messages.length - 1]?.createdAt ?? null;
  }, [messages]);

  const groupedDialogs = useMemo(() => {
    const map = new Map<string, number>();
    for (const dialog of dialogs) {
      const key = dialog.group?.id ?? "ungrouped";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const base: Array<{ id: string; name: string; description: string | null; isPublic: boolean; count: number }> = [
      { id: "all", name: "All Groups", description: null, isPublic: true, count: dialogs.length },
    ];
    for (const group of groups) base.push({ ...group, count: map.get(group.id) ?? 0 });
    if (!groups.find((group) => group.id === "ungrouped") && (map.get("ungrouped") ?? 0) > 0) {
      base.push({ id: "ungrouped", name: "General", description: null, isPublic: true, count: map.get("ungrouped") ?? 0 });
    }
    return base;
  }, [dialogs, groups]);

  const filteredDialogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return dialogs.filter((dialog) => {
      // Hide dialogs with no messages — they live in the People tab until a message is sent
      if (dialog.messages.length === 0 && dialog.id !== selectedDialogId) return false;
      const title = pickDialogTitle(dialog, session?.user?.id);
      const groupId = dialog.group?.id ?? "ungrouped";
      const latest = dialog.messages[0];
      const preview = getMessagePreview(latest).toLowerCase();
      const matchesGroup = activeGroup === "all" || groupId === activeGroup;
      const matchesSearch = !query || title.toLowerCase().includes(query) || preview.includes(query) || (dialog.organization?.name ?? "").toLowerCase().includes(query);
      return matchesGroup && matchesSearch;
    });
  }, [activeGroup, dialogs, searchQuery, selectedDialogId]);

  const availableEmojis = useMemo(() => {
    const source = emojiCategory === "recent" ? recentEmojis : EMOJI_LIBRARY[emojiCategory];
    if (!emojiSearch.trim()) return source;
    const query = emojiSearch.trim();
    return source.filter((emoji) => emoji.includes(query));
  }, [emojiCategory, emojiSearch, recentEmojis]);

  const primaryPeer = useMemo(() => {
    if (!selectedDialog || !session?.user?.id) return null;
    return selectedDialog.members.find((member) => member.userId !== session.user.id)?.user ?? null;
  }, [selectedDialog, session?.user?.id]);

  const isGroupConversation = useMemo(() => {
    if (!selectedDialog) return false;
    return selectedDialog.members.length > 2 || Boolean(selectedDialog.group);
  }, [selectedDialog]);

  const filteredPeople = useMemo(() => {
    const query = peopleSearch.trim().toLowerCase();
    const others = teamUsers.filter((u) => u.id !== session?.user?.id);
    if (!query) return others;
    return others.filter((u) => {
      const label = `${u.fullname} ${u.name} ${u.email} ${u.department ?? ""} ${u.position ?? ""}`.toLowerCase();
      return label.includes(query);
    });
  }, [peopleSearch, session?.user?.id, teamUsers]);

  const filteredGroupUsers = useMemo(() => {
    const query = groupMemberSearch.trim().toLowerCase();
    const rows = teamUsers.filter((user) => user.id !== session?.user?.id);
    if (!query) return rows;
    return rows.filter((user) => {
      const label = `${user.fullname} ${user.name} ${user.email}`.toLowerCase();
      return label.includes(query);
    });
  }, [groupMemberSearch, session?.user?.id, teamUsers]);

  const onPickEmoji = useCallback((emoji: string) => {
    setMessageInput((prev) => `${prev}${emoji}`);
    setRecentEmojis((prev) => {
      const next = [emoji, ...prev.filter((value) => value !== emoji)].slice(0, 48);
      try {
        window.localStorage.setItem(RECENT_EMOJIS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // no-op
      }
      return next;
    });
    setShowEmoji(false);
  }, []);

  const attachFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
    const allFiles = Array.from(files);
    const oversized = allFiles.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setError(`File too large: ${oversized.map((f) => f.name).join(", ")}. Max 4 MB per file.`);
    }
    const validFiles = allFiles.filter((f) => f.size <= MAX_FILE_SIZE).slice(0, 5);
    if (validFiles.length === 0) return;
    try {
      const rows = await Promise.all(
        validFiles.map(async (file) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          dataUrl: await fileToDataUrl(file),
          kind: inferAttachmentKind(file.type || "application/octet-stream"),
        } satisfies ComposerAttachment))
      );
      setComposerAttachments((prev) => [...prev, ...rows].slice(0, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach files");
    }
  }, []);

  const sendMessage = useCallback(async (options?: { targetDialogId?: string; text?: string; attachments?: ComposerAttachment[]; replyTarget?: DialogMessage | null; forwardTarget?: DialogMessage | null }) => {
    const targetDialogId = options?.targetDialogId ?? selectedDialogId;
    if (!targetDialogId || sending) return;

    const text = options?.text ?? messageInput;
    const attachments = options?.attachments ?? composerAttachments;
    const reply = options?.replyTarget ?? replyTarget;
    const forward = options?.forwardTarget ?? forwardTarget;

    if (!text.trim() && attachments.length === 0) return;

    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/chat/dialogs/${targetDialogId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          attachments,
          replyTo: reply ? { id: reply.id, text: reply.payload.text || getMessagePreview(reply), senderName: displayName(reply.user) } : null,
          forwardedFrom: forward ? { id: forward.id, senderName: displayName(forward.user) } : null,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed to send message");
      }
      const created = (await response.json()) as DialogMessage;

      if (targetDialogId === selectedDialogId) {
        setMessageInput("");
        setComposerAttachments([]);
        setReplyTarget(null);
        setForwardTarget(null);
        setMessages((prev) => mergeMessages(prev, [created]));
        requestAnimationFrame(() => {
          const node = messagesContainerRef.current;
          if (node) node.scrollTop = node.scrollHeight;
        });
      }

      await loadDialogs({ silent: true });
      if (targetDialogId === selectedDialogId) {
        await loadDialogDetail(targetDialogId, { silent: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }, [selectedDialogId, sending, messageInput, composerAttachments, replyTarget, forwardTarget, loadDialogs, loadDialogDetail]);

  const beginRecording = async () => {
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      recordChunksRef.current = [];
      sendRecordingRef.current = true;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        if (recordingTimerRef.current) {
          window.clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        const chunks = [...recordChunksRef.current];
        recordChunksRef.current = [];
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setIsRecording(false);

        const durationSec = recordingSeconds;
        setRecordingSeconds(0);

        if (!sendRecordingRef.current || chunks.length === 0) return;

        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          const dataUrl = await fileToDataUrl(blob);
          const attachment: ComposerAttachment = {
            id: `${Date.now()}-voice`,
            fileName: `voice-note-${Date.now()}.webm`,
            mimeType: blob.type || "audio/webm",
            sizeBytes: blob.size,
            dataUrl,
            kind: "audio",
            durationSec: durationSec || undefined,
          };
          await sendMessage({ text: "", attachments: [attachment], replyTarget: null, forwardTarget: null });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to send voice note");
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      setError("Microphone access denied or unavailable");
    }
  };

  const stopRecording = (send: boolean) => {
    if (!mediaRecorderRef.current) return;
    sendRecordingRef.current = send;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
  };

  const deleteMessageAsAdmin = async (messageId: string) => {
    if (!canAdminDelete) return;
    try {
      const response = await fetch(`/api/chat/messages/${messageId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed to delete message");
      }
      const updated = (await response.json()) as DialogMessage;
      setMessages((prev) => prev.map((message) => (message.id === messageId ? updated : message)));
      setSelectedMessageId(null);
      if (selectedDialogId) await loadDialogDetail(selectedDialogId, { silent: true });
      await loadDialogs({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete message");
    }
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const response = await fetch("/api/chat/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDescription.trim() || null }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed to create group");
      }
      setNewGroupName("");
      setNewGroupDescription("");
      setCreatingGroup(false);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    }
  };

  const openOrCreateDirectChat = useCallback(async (targetUserId: string) => {
    // Look for an existing 1:1 dialog with this user
    const existing = dialogs.find((d) => {
      if (d.members.length !== 2) return false;
      return d.members.some((m) => m.userId === targetUserId) && d.members.some((m) => m.userId === session?.user?.id);
    });
    if (existing) {
      setSelectedDialogId(existing.id);
      return;
    }
    try {
      const response = await fetch("/api/chat/dialogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: [targetUserId] }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed to open chat");
      }
      const created = (await response.json()) as DialogSummary;
      await loadDialogs({ silent: true });
      setSelectedDialogId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open direct chat");
    }
  }, [dialogs, session?.user?.id, loadDialogs]);

  const createGroupChat = async () => {
    if (!newDialogTitle.trim()) {
      setError("Group chat title is required");
      return;
    }
    if (newDialogMemberIds.length === 0) {
      setError("Select at least one member");
      return;
    }

    setSubmittingDialog(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/dialogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: newDialogTitle.trim(),
          memberIds: newDialogMemberIds,
          ...(newDialogGroupId !== "none" ? { groupId: newDialogGroupId } : {}),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed to create group chat");
      }
      const createdDialog = (await response.json()) as DialogSummary;

      setCreatingDialog(false);
      setNewDialogTitle("");
      setNewDialogMemberIds([]);
      setGroupMemberSearch("");
      setNewDialogGroupId("none");
      await loadDialogs({ silent: true });
      setSelectedDialogId(createdDialog.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group chat");
    } finally {
      setSubmittingDialog(false);
    }
  };

  return (
    <div className="flex h-full bg-[radial-gradient(circle_at_top_left,#fff5f6_0%,#f9fafd_42%,#f3f5fa_100%)]">
      <aside className="flex w-72 shrink-0 flex-col border-r border-[#f0c8cb] bg-[linear-gradient(180deg,#fffefe_0%,#fff7f8_100%)] shadow-[10px_0_24px_-20px_rgba(107,14,20,0.35)]">
        <div className="border-b border-[#f1d7da] bg-[linear-gradient(120deg,#fffdfd,#fff4f5)] px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#7e1720]">Chat</h2>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-lg border border-[#f1d1d4] bg-white/80 px-2 text-xs text-[#8b1720] hover:bg-[#fff2f3]"
                onClick={() => setCreatingDialog((v) => !v)}
              >
                <Users className="mr-1 h-3.5 w-3.5" />
                New Group Chat
              </Button>
              {session?.user?.isAdmin ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-lg border border-[#f1d1d4] bg-white/80 px-2 text-xs text-[#8b1720] hover:bg-[#fff2f3]"
                  onClick={() => setCreatingGroup((v) => !v)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Channel
                </Button>
              ) : null}
            </div>
          </div>
          {creatingDialog ? (
            <div className="mt-2 space-y-2 rounded-xl border border-[#f2d5d8] bg-[#fff8f9] p-2.5">
              <Input
                value={newDialogTitle}
                onChange={(e) => setNewDialogTitle(e.target.value)}
                placeholder="Group chat title"
                className="h-8 border-[#efcfd3] text-xs focus-visible:border-[var(--twx-primary)] focus-visible:ring-[var(--twx-primary)]/30"
              />
              <Input
                value={groupMemberSearch}
                onChange={(e) => setGroupMemberSearch(e.target.value)}
                placeholder="Search members"
                className="h-8 border-[#efcfd3] text-xs focus-visible:border-[var(--twx-primary)] focus-visible:ring-[var(--twx-primary)]/30"
              />
              <select
                value={newDialogGroupId}
                onChange={(e) => setNewDialogGroupId(e.target.value)}
                className="h-8 w-full rounded-md border border-[#ebc9cd] bg-white px-2 text-xs text-slate-700"
              >
                <option value="none">No channel</option>
                {groups.map((group) => (
                  <option key={`dialog-group-${group.id}`} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-[#edd5d8] bg-white p-1.5">
                {filteredGroupUsers.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-slate-500">No users found</p>
                ) : (
                  filteredGroupUsers.map((user) => {
                    const checked = newDialogMemberIds.includes(user.id);
                    return (
                      <label
                        key={`dialog-member-${user.id}`}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-[#fff3f4]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const enabled = e.target.checked;
                            setNewDialogMemberIds((prev) =>
                              enabled ? Array.from(new Set([...prev, user.id])) : prev.filter((id) => id !== user.id)
                            );
                          }}
                        />
                        <span className="text-xs text-slate-700">
                          {user.fullname || user.name}{" "}
                          <span className="text-slate-400">({user.email})</span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-500">{newDialogMemberIds.length} selected</p>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    className="h-7 bg-[var(--twx-primary)] px-2 text-xs text-white hover:bg-[#da0000]"
                    disabled={submittingDialog}
                    onClick={() => void createGroupChat()}
                  >
                    {submittingDialog ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    Create
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-[#ebc9cd] px-2 text-xs text-slate-700 hover:bg-white"
                    onClick={() => setCreatingDialog(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          {creatingGroup ? (
            <div className="mt-2 space-y-2 rounded-xl border border-[#f2d5d8] bg-[#fff8f9] p-2.5">
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name"
                className="h-8 border-[#efcfd3] text-xs focus-visible:border-[var(--twx-primary)] focus-visible:ring-[var(--twx-primary)]/30"
              />
              <Input
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder="Description (optional)"
                className="h-8 border-[#efcfd3] text-xs focus-visible:border-[var(--twx-primary)] focus-visible:ring-[var(--twx-primary)]/30"
              />
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="h-7 bg-[var(--twx-primary)] px-2 text-xs text-white hover:bg-[#da0000]"
                  onClick={() => void createGroup()}
                >
                  Create
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-[#ebc9cd] px-2 text-xs text-slate-700 hover:bg-white"
                  onClick={() => setCreatingGroup(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[#f2d7da]">
          <button
            onClick={() => setSidebarTab("chats")}
            className={cn(
              "flex-1 py-2 text-xs font-medium transition-colors",
              sidebarTab === "chats"
                ? "border-b-2 border-[var(--twx-primary)] text-[#b01018]"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            Chats
          </button>
          <button
            onClick={() => setSidebarTab("people")}
            className={cn(
              "flex-1 py-2 text-xs font-medium transition-colors",
              sidebarTab === "people"
                ? "border-b-2 border-[var(--twx-primary)] text-[#b01018]"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            People ({teamUsers.filter((u) => u.id !== session?.user?.id).length})
          </button>
        </div>

        {sidebarTab === "chats" ? (
          <>
            <div className="p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#b46d72]" />
                <Input
                  placeholder="Search chats"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 rounded-lg border-[#efcfd3] bg-white/95 pl-7 text-xs focus-visible:border-[var(--twx-primary)] focus-visible:ring-[var(--twx-primary)]/30"
                />
              </div>
            </div>

            <div className="px-2 pb-2">
              <div className="flex flex-wrap gap-1">
                {groupedDialogs.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => setActiveGroup(group.id)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs transition-colors",
                      activeGroup === group.id
                        ? "border border-[#f2ccd0] bg-[#fff0f2] text-[#b01018]"
                        : "border border-transparent bg-white text-slate-600 hover:border-[#edd5d8] hover:bg-[#fff5f6]"
                    )}
                  >
                    {group.name} ({group.count})
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border-t border-[#f2d7da]">
              {loadingDialogs ? (
                <div className="p-4 text-xs text-[#a05e63]">Loading dialogs...</div>
              ) : (
                filteredDialogs.map((dialog) => {
                  const latest = dialog.messages[0];
                  const title = pickDialogTitle(dialog, session?.user?.id);
                  const isGroup = dialog.members.length > 2 || Boolean(dialog.group);
                  const peer = !isGroup ? dialog.members.find((m) => m.userId !== session?.user?.id) : null;
                  return (
                    <button
                      key={dialog.id}
                      onClick={() => setSelectedDialogId(dialog.id)}
                      className={cn(
                        "w-full border-b border-[#f5e4e6] px-3 py-2.5 text-left transition-colors hover:bg-[#fff7f8]",
                        isGroup
                          ? "border-l-2 border-l-[#e8b4b8]"
                          : "border-l-2 border-l-transparent",
                        selectedDialogId === dialog.id && "bg-[#fff2f4] !border-l-[var(--twx-primary)]"
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="relative shrink-0">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={peer?.user.photoUrl ?? undefined} />
                            <AvatarFallback className={cn(
                              "text-xs font-semibold",
                              isGroup
                                ? "bg-[#fdeaea] text-[#8b1720]"
                                : "bg-[#e8f0fe] text-[#3b5bdb]"
                            )}>
                              {isGroup ? <Users className="h-4 w-4" /> : initials(title)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <p className="truncate text-sm font-medium text-slate-900">{title}</p>
                              {isGroup && (
                                <span className="shrink-0 rounded bg-[#fff0f1] px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#a51a22]">
                                  group
                                </span>
                              )}
                            </div>
                            <span className="shrink-0 text-[11px] text-[#b58a8d]">{formatTime(dialog.updatedAt)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isGroup && (
                              <span className="shrink-0 text-[10px] text-slate-400">
                                {dialog.members.length} members ·
                              </span>
                            )}
                            <p className="truncate text-xs text-slate-500">{getMessagePreview(latest)}</p>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
              {!loadingDialogs && filteredDialogs.length === 0 ? (
                <div className="p-4 text-xs text-[#a05e63]">No conversations found.</div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#b46d72]" />
                <Input
                  placeholder="Search people"
                  value={peopleSearch}
                  onChange={(e) => setPeopleSearch(e.target.value)}
                  className="h-8 rounded-lg border-[#efcfd3] bg-white/95 pl-7 text-xs focus-visible:border-[var(--twx-primary)] focus-visible:ring-[var(--twx-primary)]/30"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto border-t border-[#f2d7da]">
              {filteredPeople.length === 0 ? (
                <div className="p-4 text-xs text-[#a05e63]">No users found.</div>
              ) : (
                filteredPeople.map((user) => {
                  const statusColor = getUserOnlineColor(user);
                  const label = user.fullname || user.name;
                  return (
                    <button
                      key={user.id}
                      onClick={() => void openOrCreateDirectChat(user.id)}
                      className="w-full border-b border-[#f5e4e6] px-3 py-2.5 text-left transition-colors hover:bg-[#fff7f8]"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="relative shrink-0">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={user.photoUrl ?? undefined} />
                            <AvatarFallback className="bg-[#fee5e5] text-xs font-semibold text-[#9e1313]">{initials(label)}</AvatarFallback>
                          </Avatar>
                          <span
                            className={cn(
                              "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white",
                              statusColor === "green" && "bg-emerald-500",
                              statusColor === "amber" && "bg-amber-400",
                              statusColor === "gray" && "bg-slate-300"
                            )}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{label}</p>
                          <p className="truncate text-xs text-slate-500">
                            {user.position || user.department || user.email}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-[10px]",
                            statusColor === "green" && "text-emerald-600",
                            statusColor === "amber" && "text-amber-500",
                            statusColor === "gray" && "text-slate-400"
                          )}
                        >
                          {statusColor === "green" ? "online" : statusColor === "amber" ? "away" : "offline"}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!selectedDialog ? (
          <div className="flex flex-1 items-center justify-center text-[#b07d82]">
            <div className="text-center">
              <MessageSquare className="mx-auto mb-2 h-10 w-10 opacity-40" />
              <p>Select a conversation</p>
            </div>
          </div>
        ) : (
          <>
            <header className="border-b border-[#edd5d8] bg-[linear-gradient(180deg,#ffffff_0%,#fff8f9_100%)] px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={primaryPeer?.photoUrl ?? undefined} />
                  <AvatarFallback className="bg-[#fee5e5] text-[#9e1313]">{initials(primaryPeer ? displayName(primaryPeer) : pickDialogTitle(selectedDialog, session?.user?.id))}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {isGroupConversation
                      ? pickDialogTitle(selectedDialog, session?.user?.id)
                      : primaryPeer
                        ? displayName(primaryPeer)
                        : pickDialogTitle(selectedDialog, session?.user?.id)}
                  </p>
                  <p
                    className={cn(
                      "text-xs",
                      !isGroupConversation && primaryPeer && isOnline(primaryPeer.lastActivity)
                        ? "text-emerald-600"
                        : "text-slate-500"
                    )}
                  >
                    {isGroupConversation
                      ? `${selectedDialog.members.length} participants`
                      : primaryPeer
                        ? formatLastSeen(primaryPeer.lastActivity)
                        : selectedDialog.members.length > 0
                          ? `${selectedDialog.members.length} participants`
                          : "No participants"}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <Badge variant="secondary" className="border border-[#f2cfd2] bg-[#fff1f3] text-[11px] text-[#8f1f26]">
                    {selectedDialog.status}
                  </Badge>
                  {selectedDialog.group?.name ? (
                    <Badge variant="outline" className="border-[#ead2d4] bg-white text-[11px] text-slate-600">
                      {selectedDialog.group.name}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </header>

            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,#fff8f9_0%,#f7f9fd_45%,#f2f4f8_100%)] p-4"
              onScroll={(event) => {
                if (event.currentTarget.scrollTop <= 64) {
                  void loadOlderMessages();
                }
              }}
            >
              {loadingDialogDetail || loadingMessages ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading conversation...
                </div>
              ) : (
                <div className="space-y-2">
                  {loadingOlderMessages ? (
                    <div className="flex items-center justify-center py-1 text-xs text-slate-500">
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Loading older messages...
                    </div>
                  ) : null}
                  {!hasOlderMessages && messages.length > 0 ? (
                    <div className="py-1 text-center text-[11px] text-slate-400">Beginning of conversation</div>
                  ) : null}
                  {messages.map((message) => {
                    const mine = message.userId === session?.user?.id;
                    const sender = displayName(message.user);
                    const payload = message.payload;
                    const seenCount = payload.seenByUserIds.length;
                    const selected = selectedMessageId === message.id;
                    return (
                      <div key={message.id} className={cn("group flex w-full", mine ? "justify-end" : "justify-start")}>
                        <div className={cn("flex max-w-[40%] flex-col", mine ? "items-end" : "items-start")}>
                          <div
                          data-message-bubble="true"
                          onClick={() => setSelectedMessageId(message.id)}
                          className={cn(
                            "rounded-2xl px-3 py-2 shadow-sm transition-shadow",
                            mine
                              ? "rounded-tr-sm bg-[var(--twx-primary)] text-white"
                              : "rounded-tl-sm border border-[#f0d8db] bg-white text-slate-800",
                            selected && "ring-2 ring-[var(--twx-primary)]/35"
                          )}
                          >
                          {!mine && isGroupConversation ? <p className="mb-1 text-[11px] font-semibold text-slate-500">{sender}</p> : null}
                          {payload.forwardedFrom ? (
                            <p className={cn("mb-1 text-[11px]", mine ? "text-red-100" : "text-slate-500")}>Forwarded</p>
                          ) : null}
                          {payload.replyTo ? (
                            <div
                              className={cn(
                                "mb-1 rounded-md border-l-2 px-2 py-1 text-xs",
                                mine ? "border-red-200 bg-[#d6121a]" : "border-[var(--twx-primary)]/40 bg-[#fff2f2]"
                              )}
                            >
                              <p className={cn("font-semibold", mine ? "text-red-100" : "text-[#b31515]")}>
                                {payload.replyTo.senderName || "Reply"}
                              </p>
                              <p className={cn("truncate", mine ? "text-red-50" : "text-slate-600")}>{payload.replyTo.text}</p>
                            </div>
                          ) : null}
                          {payload.type === "deleted" ? (
                            <p className={cn("text-sm italic", mine ? "text-red-100" : "text-slate-500")}>
                              This message was removed by administrator.
                            </p>
                          ) : payload.text ? (
                            <LinkifiedMessage
                              text={payload.text}
                              textClassName="text-sm"
                              linkClassName={mine ? "text-red-50 hover:text-white" : "text-blue-600 hover:text-blue-800"}
                              previewClassName={
                                mine
                                  ? "border-red-200/30 bg-[#d6121a] text-red-50 hover:bg-[#bc0f16]"
                                  : "border-[#ecd9db] bg-[#fdf8f9] text-slate-700 hover:bg-white"
                              }
                            />
                          ) : null}

                          {payload.attachments.length > 0 ? (
                            <div className="mt-2 space-y-2">
                              {payload.attachments.map((attachment) => (
                                <div
                                  key={attachment.id}
                                  className={cn(
                                    "overflow-hidden rounded-lg border",
                                    mine ? "border-red-200/30 bg-[#d6121a]" : "border-[#ecd9db] bg-[#fdf8f9]"
                                  )}
                                >
                                  {attachment.kind === "image" ? (
                                    <img src={attachment.dataUrl} alt={attachment.fileName} className="max-h-72 w-full object-cover" />
                                  ) : null}
                                  {attachment.kind === "video" ? (
                                    <video controls className="max-h-72 w-full" src={attachment.dataUrl} />
                                  ) : null}
                                  {attachment.kind === "audio" ? (
                                    <audio controls className="w-full" src={attachment.dataUrl} />
                                  ) : null}
                                  {attachment.kind === "file" ? (
                                    <div className="p-2 text-xs">
                                      <p className="font-medium">{attachment.fileName}</p>
                                      <a
                                        href={attachment.dataUrl}
                                        download={attachment.fileName}
                                        className={cn("underline", mine ? "text-red-100" : "text-[#b31515]")}
                                      >
                                        Download
                                      </a>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <div className={cn("mt-0.5 flex items-center gap-1", mine ? "justify-end" : "justify-start")}>
                            <p className={cn("text-[10px]", mine ? "text-red-200/80" : "text-slate-400/70")}>{formatTime(message.createdAt)}</p>
                            {mine ? (
                              <CheckCheck className={cn("h-3 w-3", seenCount > 1 ? "text-blue-300" : "text-red-300/50")} />
                            ) : null}
                          </div>
                          </div>
                          <div
                            data-message-actions="true"
                            className={cn(
                              "mt-1 flex items-center gap-1 rounded-full border border-[#f0d2d5] bg-white px-1 py-0.5 shadow-md transition-opacity",
                              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            )}
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[11px] text-slate-600 hover:bg-[#fff1f2] hover:text-[#ad1720]"
                              onClick={(event) => {
                                event.stopPropagation();
                                setReplyTarget(message);
                                setSelectedMessageId(message.id);
                              }}
                            >
                              <Reply className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[11px] text-slate-600 hover:bg-[#fff1f2] hover:text-[#ad1720]"
                              onClick={(event) => {
                                event.stopPropagation();
                                setForwardTarget(message);
                                setForwardDialogId(selectedDialog.id);
                                setSelectedMessageId(message.id);
                              }}
                            >
                              <Forward className="h-3.5 w-3.5" />
                            </Button>
                            {canAdminDelete ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5 text-[11px] text-slate-600 hover:bg-[#fff1f2] hover:text-[#ad1720]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void deleteMessageAsAdmin(message.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-[#edd6d8] bg-[linear-gradient(180deg,#ffffff_0%,#fff8f9_100%)] px-4 py-3">
              {replyTarget ? (
                <div className="mb-2 flex items-center justify-between rounded-lg border border-[var(--twx-primary)]/20 bg-[#fff3f4] px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#b31515]">Replying to {displayName(replyTarget.user)}</p>
                    <p className="truncate text-slate-600">{replyTarget.payload.text || getMessagePreview(replyTarget)}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setReplyTarget(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}

              {forwardTarget ? (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-[#edd6d8] bg-[#fff8f9] px-3 py-2 text-xs">
                  <p className="text-slate-600">
                    Forwarding:{" "}
                    <span className="font-medium text-slate-800">
                      {forwardTarget.payload.text || getMessagePreview(forwardTarget)}
                    </span>
                  </p>
                  <select
                    className="h-7 rounded-md border border-[#e7cace] bg-white px-2 text-xs"
                    value={forwardDialogId}
                    onChange={(e) => setForwardDialogId(e.target.value)}
                  >
                    {dialogs.map((dialog) => (
                      <option key={`forward-${dialog.id}`} value={dialog.id}>
                        {pickDialogTitle(dialog, session?.user?.id)}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    className="h-7 bg-[var(--twx-primary)] px-2 text-xs text-white hover:bg-[#d30000]"
                    onClick={() =>
                      void sendMessage({
                        targetDialogId: forwardDialogId || selectedDialog.id,
                        text: forwardTarget.payload.text,
                        attachments: forwardTarget.payload.attachments as ComposerAttachment[],
                        replyTarget: null,
                        forwardTarget,
                      })
                    }
                  >
                    Send forward
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setForwardTarget(null);
                      setForwardDialogId("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}

              {composerAttachments.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  {composerAttachments.map((attachment) => (
                    <div key={attachment.id} className="relative overflow-hidden rounded-lg border border-[#ecdadd] bg-[#fff8f9]">
                      {attachment.kind === "image" ? (
                        <img src={attachment.dataUrl} alt={attachment.fileName} className="h-14 w-14 object-cover" />
                      ) : null}
                      {attachment.kind !== "image" ? (
                        <div className="px-2 py-1 text-xs text-slate-700">{attachment.fileName}</div>
                      ) : null}
                      <button
                        className="absolute right-0 top-0 rounded-bl bg-black/60 p-1 text-white"
                        onClick={() => setComposerAttachments((prev) => prev.filter((item) => item.id !== attachment.id))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {isRecording ? (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                  Recording {recordingSeconds}s
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7 px-2 text-xs text-red-700 hover:bg-red-100"
                    onClick={() => stopRecording(false)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 bg-[var(--twx-primary)] px-2 text-xs text-white hover:bg-[#d30000]"
                    onClick={() => stopRecording(true)}
                  >
                    Send voice
                  </Button>
                </div>
              ) : null}

              <div className="flex items-center gap-1.5">
                <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-[#fff0f2] hover:text-[#b2141b]">
                  <Paperclip className="h-4 w-4" />
                  <input type="file" className="hidden" multiple onChange={(e) => void attachFiles(e.target.files)} />
                </label>

                <div className="relative" ref={emojiPanelRef}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 text-slate-500 hover:bg-[#fff0f2] hover:text-[#b2141b]"
                    onClick={() => setShowEmoji((v) => !v)}
                  >
                    <Smile className="h-4 w-4" />
                  </Button>

                  {showEmoji ? (
                    <div className="absolute bottom-10 left-0 z-40 w-[320px] overflow-hidden rounded-xl border border-[#efcfd3] bg-white shadow-[0_20px_52px_-24px_rgba(93,16,23,0.5)]">
                      <div className="border-b border-[#f0dde0] p-2">
                        <Input
                          value={emojiSearch}
                          onChange={(event) => setEmojiSearch(event.target.value)}
                          placeholder="Search emoji"
                          className="h-8 border-[#edd2d6] text-xs focus-visible:border-[var(--twx-primary)] focus-visible:ring-[var(--twx-primary)]/30"
                        />
                      </div>

                      <div className="flex gap-1 border-b border-[#f0dde0] px-2 py-1.5">
                        {EMOJI_CATEGORY_ITEMS.map((category) => (
                          <button
                            key={category.id}
                            onClick={() => setEmojiCategory(category.id)}
                            className={cn(
                              "rounded-md px-1.5 py-1 text-sm leading-none transition-colors",
                              emojiCategory === category.id
                                ? "bg-[#ffeef0] text-[#b2141b]"
                                : "text-slate-500 hover:bg-slate-100"
                            )}
                            title={category.label}
                          >
                            {category.icon}
                          </button>
                        ))}
                      </div>

                      <div className="max-h-56 overflow-y-auto p-2">
                        {availableEmojis.length === 0 ? (
                          <p className="px-1 py-3 text-xs text-slate-500">No emoji found.</p>
                        ) : (
                          <div className="grid grid-cols-8 gap-1">
                            {availableEmojis.map((emoji) => (
                              <button
                                key={`emoji-${emoji}`}
                                className="rounded-md p-1.5 text-lg hover:bg-slate-100"
                                onClick={() => onPickEmoji(emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0 text-slate-500 hover:bg-[#fff0f2] hover:text-[#b2141b]"
                  onClick={() => void beginRecording()}
                >
                  <Mic className="h-4 w-4" />
                </Button>

                <Input
                  placeholder="Type a message"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  className="h-9 flex-1 border-[#eed6d9] bg-white"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />

                <Button
                  className="h-9 bg-[var(--twx-primary)] px-3 text-white hover:bg-[#d30000]"
                  disabled={sending || (!messageInput.trim() && composerAttachments.length === 0)}
                  onClick={() => void sendMessage()}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}

        {error ? <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div> : null}
      </section>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading chat...</div>}>
      <ChatPageContent />
    </Suspense>
  );
}
