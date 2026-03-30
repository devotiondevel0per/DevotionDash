"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pencil,
  Search,
  RefreshCw,
  Inbox,
  Send,
  FileText,
  AlertTriangle,
  Trash2,
  Mail,
  Reply,
  Forward,
  Star,
  Server,
  Sparkles,
  X,
  RotateCcw,
  CheckCheck,
  Loader2,
  Settings,
  Plus,
  ShieldCheck,
  Eye,
  EyeOff,
  Paperclip,
  ImageIcon,
  Link2,
  Smile,
  MoreVertical,
  Minus,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Types ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

type EmailUser = { id: string; name: string; fullname: string; email: string };
type EmailRecipient = { id: string; type: "to" | "cc" | "bcc"; user: EmailUser };

type EmailItem = {
  id: string;
  subject: string;
  body: string;
  status: string;
  isRead: boolean;
  isStarred: boolean;
  createdAt: string;
  sentAt: string | null;
  mailboxId: string | null;
  parentId: string | null;
  threadId: string | null;
  from: EmailUser | null;
  senderEmail: string | null;
  senderName: string | null;
  recipients: EmailRecipient[];
  attachments?: Array<{ id: string; fileName: string; fileSize: number; mimeType: string; fileUrl: string }>;
  mailbox: { id: string; name: string; email: string } | null;
  _count: { attachments: number };
};

type Mailbox = {
  id: string; name: string; email: string;
  imapHost: string; imapPort: number;
  smtpHost: string; smtpPort: number;
  username: string; useSSL: boolean;
  isActive: boolean; lastSync: string | null; createdAt: string;
};
type TeamUser = { id: string; name: string; fullname: string; email: string };
type RecipientChip = { userId: string; email: string; name: string; external?: boolean };

type AiSummary = {
  summary: string;
  keyPoints: string[];
  sentiment: "positive" | "neutral" | "negative";
  actionRequired: boolean;
};

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Config ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

const STATUS_ITEMS = [
  { id: "all",     label: "All Mail",  icon: Mail },
  { id: "inbox",   label: "Inbox",     icon: Inbox },
  { id: "starred", label: "Starred",   icon: Star },
  { id: "sent",    label: "Sent",      icon: Send },
  { id: "draft",   label: "Drafts",    icon: FileText },
  { id: "spam",    label: "Spam",      icon: AlertTriangle },
  { id: "deleted", label: "Trash",     icon: Trash2 },
] as const;

type StatusId = (typeof STATUS_ITEMS)[number]["id"];
type InboxCategoryId = "primary" | "social" | "promotions";

const INBOX_CATEGORIES: { id: InboxCategoryId; label: string }[] = [
  { id: "primary", label: "Primary" },
  { id: "social", label: "Social" },
  { id: "promotions", label: "Promotions" },
];

const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-purple-100 text-purple-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
];

const SENTIMENT_CONFIG = {
  positive: { label: "Positive", className: "bg-green-100 text-green-700" },
  neutral:  { label: "Neutral",  className: "bg-gray-100 text-gray-600" },
  negative: { label: "Negative", className: "bg-red-100 text-red-600" },
};

type EmojiCategoryId = "recent" | "smileys" | "people" | "nature" | "food" | "travel" | "activity" | "symbols";

const EMOJI_CATEGORY_ITEMS: Array<{ id: EmojiCategoryId; label: string; icon: string }> = [
  { id: "recent", label: "Recently Used", icon: "\u{1F551}" },
  { id: "smileys", label: "Smileys and Emotion", icon: "\u{1F603}" },
  { id: "people", label: "People and Body", icon: "\u{1F64B}" },
  { id: "nature", label: "Animals and Nature", icon: "\u{1F98B}" },
  { id: "food", label: "Food and Drink", icon: "\u{2615}" },
  { id: "travel", label: "Travel and Places", icon: "\u{1F3E2}" },
  { id: "activity", label: "Activities", icon: "\u{1F3C6}" },
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

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToHtml(value: string): string {
  return escapeHtmlText(value).replace(/\n/g, "<br/>");
}

function htmlToPlainText(value: string): string {
  if (typeof document === "undefined") return value;
  const temp = document.createElement("div");
  temp.innerHTML = value;
  return (temp.textContent || temp.innerText || "").replace(/\u00a0/g, " ");
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Helpers ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

function initials(value: string) {
  return value.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
function displayName(u: { name: string; fullname: string } | null) {
  if (!u) return "Unknown";
  return u.fullname || u.name;
}
function avatarColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function formatDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date >= today) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (date >= yesterday) return "Yesterday";
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString([], { month: "short", day: "numeric" });
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
}
function formatFullDate(value: string) {
  return new Date(value).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function getInboxCategory(email: EmailItem): InboxCategoryId {
  const sender = `${email.senderEmail ?? ""} ${(email.senderName ?? "")}`.toLowerCase();
  const subject = email.subject.toLowerCase();
  const body = email.body.toLowerCase();
  const text = `${sender} ${subject} ${body}`;

  if (/(facebook|instagram|linkedin|x\.com|twitter|tiktok|youtube|pinterest|snapchat)/i.test(text)) return "social";
  if (/(sale|discount|offer|coupon|deal|promo|black friday|limited time|shop now|unsubscribe)/i.test(text)) return "promotions";
  if (/(invoice|receipt|statement|billing|payment|security alert|verification|otp|password|delivery|shipment|tracking|order)/i.test(text)) return "primary";
  if (/(newsletter|digest|community|forum|thread|announcement list|mailing list)/i.test(text)) return "promotions";
  return "primary";
}

function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getEmailPreview(body: string): string {
  return body
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Recipient Chip Input ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Mailbox Manager ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

type MailboxForm = {
  name: string; email: string;
  imapHost: string; imapPort: string;
  smtpHost: string; smtpPort: string;
  username: string; password: string;
  useSSL: boolean;
};

type MailboxTab = "information" | "filters" | "permissions" | "signature" | "auto-reply";
type MailboxPermissionScope = "private" | "team" | "custom";
type MailboxLabel = "primary" | "social" | "promotions";

type MailboxExtras = {
  syncSent: boolean;
  syncDrafts: boolean;
  syncSpam: boolean;
  syncTrash: boolean;
  filterKeywords: string;
  filterMoveTo: StatusId;
  permissionScope: MailboxPermissionScope;
  permissionCanRead: boolean;
  permissionCanCompose: boolean;
  permissionCanManage: boolean;
  signature: string;
  autoReplyEnabled: boolean;
  autoReplySubject: string;
  autoReplyBody: string;
  autoReplyStartDate: string;
  autoReplyEndDate: string;
  defaultInboxLabel: MailboxLabel;
};

const DEFAULT_MAILBOX_EXTRAS: MailboxExtras = {
  syncSent: true,
  syncDrafts: true,
  syncSpam: true,
  syncTrash: true,
  filterKeywords: "",
  filterMoveTo: "inbox",
  permissionScope: "team",
  permissionCanRead: true,
  permissionCanCompose: true,
  permissionCanManage: false,
  signature: "Best regards,\n#fullname#\n#company#",
  autoReplyEnabled: false,
  autoReplySubject: "",
  autoReplyBody: "",
  autoReplyStartDate: "",
  autoReplyEndDate: "",
  defaultInboxLabel: "primary",
};

const MAILBOX_EXTRAS_STORAGE_KEY = "zeddash_mailbox_extras_v1";

function loadMailboxExtrasMap(): Record<string, MailboxExtras> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MAILBOX_EXTRAS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<MailboxExtras>>;
    if (!parsed || typeof parsed !== "object") return {};
    const next: Record<string, MailboxExtras> = {};
    for (const [id, extras] of Object.entries(parsed)) {
      next[id] = { ...DEFAULT_MAILBOX_EXTRAS, ...(extras ?? {}) };
    }
    return next;
  } catch {
    return {};
  }
}

function saveMailboxExtrasMap(value: Record<string, MailboxExtras>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MAILBOX_EXTRAS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

function mergeMailboxExtras(value: Partial<MailboxExtras> | null | undefined): MailboxExtras {
  return { ...DEFAULT_MAILBOX_EXTRAS, ...(value ?? {}) };
}

const EMPTY_MB_FORM: MailboxForm = {
  name: "", email: "", imapHost: "", imapPort: "993",
  smtpHost: "", smtpPort: "587", username: "", password: "", useSSL: true,
};

function MailboxManagerDialog({ open, onClose, mailboxes, onCreated, onUpdated, onDeleted, onSync }: {
  open: boolean; onClose: () => void;
  mailboxes: Mailbox[];
  onCreated: (mb: Mailbox) => void;
  onUpdated: (mb: Mailbox) => void;
  onDeleted: (id: string) => void;
  onSync: (imported: number) => Promise<void> | void;
}) {
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editTarget, setEditTarget] = useState<Mailbox | null>(null);
  const [form, setForm] = useState<MailboxForm>(EMPTY_MB_FORM);
  const [activeTab, setActiveTab] = useState<MailboxTab>("information");
  const [extras, setExtras] = useState<MailboxExtras>(DEFAULT_MAILBOX_EXTRAS);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [showSignatureLink, setShowSignatureLink] = useState(false);
  const [signatureLinkText, setSignatureLinkText] = useState("");
  const [signatureLinkUrl, setSignatureLinkUrl] = useState("");
  const [showSignatureImage, setShowSignatureImage] = useState(false);
  const [signatureImageAlt, setSignatureImageAlt] = useState("");
  const [signatureImageUrl, setSignatureImageUrl] = useState("");
  const [showSignatureEmoji, setShowSignatureEmoji] = useState(false);
  const [signatureEmojiSearch, setSignatureEmojiSearch] = useState("");
  const [signatureEmojiCategory, setSignatureEmojiCategory] = useState<EmojiCategoryId>("recent");
  const [signatureRecentEmojis, setSignatureRecentEmojis] = useState<string[]>([]);
  const signatureRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setView("list");
      setEditTarget(null);
      setForm(EMPTY_MB_FORM);
      setExtras(DEFAULT_MAILBOX_EXTRAS);
      setActiveTab("information");
      setShowPassword(false);
      setConfirmDeleteId(null);
      setTestResult({});
      setShowSignatureLink(false);
      setShowSignatureImage(false);
      setShowSignatureEmoji(false);
      setSignatureLinkText("");
      setSignatureLinkUrl("");
      setSignatureImageAlt("");
      setSignatureImageUrl("");
      setSignatureEmojiSearch("");
      setSignatureEmojiCategory("recent");
      try {
        const raw = window.localStorage.getItem("zeddash_recent_emojis_v1");
        if (raw) {
          const parsed = JSON.parse(raw) as string[];
          if (Array.isArray(parsed)) setSignatureRecentEmojis(parsed.slice(0, 24));
        }
      } catch {
        setSignatureRecentEmojis([]);
      }
    }
  }, [open]);

  async function testConnection(mb: Mailbox) {
    setTestingId(mb.id);
    setTestResult((p) => ({ ...p, [mb.id]: { ok: false, msg: "Testing..." } }));
    try {
      const res = await fetch(`/api/email/mailboxes/${mb.id}/test`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; messages?: number; unseen?: number; error?: string };
      if (data.ok) {
        setTestResult((p) => ({ ...p, [mb.id]: { ok: true, msg: `Connected - ${data.messages ?? 0} messages, ${data.unseen ?? 0} unread` } }));
      } else {
        setTestResult((p) => ({ ...p, [mb.id]: { ok: false, msg: data.error ?? "Connection failed" } }));
      }
    } catch { setTestResult((p) => ({ ...p, [mb.id]: { ok: false, msg: "Network error" } })); }
    finally { setTestingId(null); }
  }

  async function syncMailbox(mb: Mailbox, onDone: (imported: number) => Promise<void> | void) {
    setSyncingId(mb.id);
    try {
      let nextCursor: string | null = null;
      let hasMore = true;
      let rounds = 0;
      let totalImported = 0;
      let totalUpdated = 0;

      while (hasMore && rounds < 300) {
        const query = nextCursor
          ? `?force=1&cursor=${encodeURIComponent(nextCursor)}`
          : "?force=1";
        const res = await fetch(`/api/email/mailboxes/${mb.id}/sync${query}`, { method: "POST" });
        const data = (await res.json()) as {
          imported?: number;
          updated?: number;
          skipped?: number;
          error?: string;
          hasMore?: boolean;
          nextCursor?: string | null;
        };
        if (!res.ok || data.error) {
          toast.error(`Sync failed: ${data.error ?? "Unknown error"}`);
          await Promise.resolve(onDone(0));
          return;
        }
        totalImported += data.imported ?? 0;
        totalUpdated += data.updated ?? 0;
        hasMore = Boolean(data.hasMore);
        nextCursor = data.nextCursor ?? null;
        rounds++;
      }

      const changed = totalImported + totalUpdated;
      toast.success(
        changed > 0
          ? `Synced ${totalImported} new, updated ${totalUpdated} existing`
          : "Inbox is up to date"
      );
      await Promise.resolve(onDone(changed));
    } catch { toast.error("Sync failed"); await Promise.resolve(onDone(0)); }
    finally { setSyncingId(null); }
  }

  function openCreate() {
    setForm(EMPTY_MB_FORM);
    setExtras(DEFAULT_MAILBOX_EXTRAS);
    setActiveTab("information");
    setShowSignatureLink(false);
    setShowSignatureImage(false);
    setShowSignatureEmoji(false);
    setSignatureEmojiSearch("");
    setSignatureEmojiCategory("recent");
    setEditTarget(null);
    setShowPassword(false);
    setView("create");
  }
  function openEdit(mb: Mailbox) {
    setForm({ name: mb.name, email: mb.email, imapHost: mb.imapHost, imapPort: String(mb.imapPort), smtpHost: mb.smtpHost, smtpPort: String(mb.smtpPort), username: mb.username, password: "", useSSL: mb.useSSL });
    const extrasMap = loadMailboxExtrasMap();
    setExtras(mergeMailboxExtras(extrasMap[mb.id]));
    setActiveTab("information");
    setShowSignatureLink(false);
    setShowSignatureImage(false);
    setShowSignatureEmoji(false);
    setSignatureEmojiSearch("");
    setSignatureEmojiCategory("recent");
    setEditTarget(mb);
    setShowPassword(false);
    setView("edit");
  }

  function set(key: keyof MailboxForm, value: string | boolean) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function setExtra<K extends keyof MailboxExtras>(key: K, value: MailboxExtras[K]) {
    setExtras((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.name || !form.email || !form.imapHost || !form.smtpHost || !form.username) {
      toast.error("Fill in all required fields"); return;
    }
    if (view === "create" && !form.password) { toast.error("Password is required"); return; }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), email: form.email.trim(),
        imapHost: form.imapHost.trim(), imapPort: Number(form.imapPort) || 993,
        smtpHost: form.smtpHost.trim(), smtpPort: Number(form.smtpPort) || 587,
        username: form.username.trim(), useSSL: form.useSSL,
        ...(form.password ? { password: form.password } : {}),
      };

      if (view === "create") {
        const res = await fetch("/api/email/mailboxes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) { const e = (await res.json().catch(() => null)) as { error?: string } | null; throw new Error(e?.error ?? "Failed"); }
        const mb = (await res.json()) as Mailbox;
        const extrasMap = loadMailboxExtrasMap();
        extrasMap[mb.id] = mergeMailboxExtras(extras);
        saveMailboxExtrasMap(extrasMap);
        toast.success("Mailbox created");
        onCreated(mb);
      } else if (editTarget) {
        const res = await fetch(`/api/email/mailboxes/${editTarget.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) { const e = (await res.json().catch(() => null)) as { error?: string } | null; throw new Error(e?.error ?? "Failed"); }
        const mb = (await res.json()) as Mailbox;
        const extrasMap = loadMailboxExtrasMap();
        extrasMap[mb.id] = mergeMailboxExtras(extras);
        saveMailboxExtrasMap(extrasMap);
        toast.success("Mailbox updated");
        onUpdated(mb);
      }
      setView("list");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/email/mailboxes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      const extrasMap = loadMailboxExtrasMap();
      if (extrasMap[id]) {
        delete extrasMap[id];
        saveMailboxExtrasMap(extrasMap);
      }
      toast.success("Mailbox deleted");
      onDeleted(id);
      setConfirmDeleteId(null);
    } catch { toast.error("Failed to delete mailbox"); }
    finally { setDeleting(null); }
  }

  async function toggleActive(mb: Mailbox) {
    try {
      const res = await fetch(`/api/email/mailboxes/${mb.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !mb.isActive }) });
      if (!res.ok) throw new Error();
      onUpdated({ ...mb, isActive: !mb.isActive });
    } catch { toast.error("Failed to update"); }
  }

  function insertIntoSignature(text: string) {
    setExtras((prev) => {
      const current = prev.signature;
      const el = signatureRef.current;
      if (!el) {
        const appended = current ? `${current}${current.endsWith("\n") ? "" : "\n"}${text}` : text;
        return { ...prev, signature: appended };
      }
      const start = el.selectionStart ?? current.length;
      const end = el.selectionEnd ?? current.length;
      const next = `${current.slice(0, start)}${text}${current.slice(end)}`;
      const cursor = start + text.length;
      queueMicrotask(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
      return { ...prev, signature: next };
    });
  }

  function applySignatureLink() {
    if (!isHttpUrl(signatureLinkUrl)) {
      toast.error("Enter a valid URL (http or https).");
      return;
    }
    const label = signatureLinkText.trim() || signatureLinkUrl.trim();
    insertIntoSignature(`[${label}](${signatureLinkUrl.trim()})`);
    setShowSignatureLink(false);
    setSignatureLinkText("");
    setSignatureLinkUrl("");
  }

  function applySignatureImage() {
    if (!isHttpUrl(signatureImageUrl)) {
      toast.error("Enter a valid image URL (http or https).");
      return;
    }
    const alt = signatureImageAlt.trim() || "Signature image";
    insertIntoSignature(`![${alt}](${signatureImageUrl.trim()})`);
    setShowSignatureImage(false);
    setSignatureImageAlt("");
    setSignatureImageUrl("");
  }

  function pickSignatureEmoji(emoji: string) {
    insertIntoSignature(emoji);
    const next = [emoji, ...signatureRecentEmojis.filter((e) => e !== emoji)].slice(0, 24);
    setSignatureRecentEmojis(next);
    try {
      window.localStorage.setItem("zeddash_recent_emojis_v1", JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }

  const signatureEmojiPool = useMemo(() => {
    const source =
      signatureEmojiCategory === "recent"
        ? signatureRecentEmojis
        : EMOJI_LIBRARY[signatureEmojiCategory];
    const q = signatureEmojiSearch.trim().toLowerCase();
    if (!q) return source;
    return source.filter((emoji) => emoji.toLowerCase().includes(q));
  }, [signatureEmojiCategory, signatureEmojiSearch, signatureRecentEmojis]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {view !== "list" && (
              <button onClick={() => setView("list")} className="text-gray-400 hover:text-gray-700 mr-1">
                Back
              </button>
            )}
            <Server className="h-4 w-4 text-gray-500" />
            {view === "list" ? "Mailboxes" : view === "create" ? "Add Mailbox" : "Edit Mailbox"}
          </DialogTitle>
        </DialogHeader>

        {view === "list" ? (
          <div className="space-y-3 py-1">
            {mailboxes.length === 0 ? (
              <div className="py-8 text-center text-gray-400">
                <Server className="h-10 w-10 mx-auto mb-3 opacity-25" />
                <p className="text-sm">No mailboxes configured yet.</p>
                <p className="text-xs mt-1">Add a mailbox to connect an IMAP/SMTP account.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {mailboxes.map((mb) => (
                  <div key={mb.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <div className="flex items-center gap-3 p-3">
                      <div className={cn("h-9 w-9 rounded-full flex items-center justify-center shrink-0", mb.isActive ? "bg-green-100" : "bg-gray-100")}>
                        <Server className={cn("h-4 w-4", mb.isActive ? "text-green-600" : "text-gray-400")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{mb.name}</p>
                        <p className="text-xs text-gray-400 truncate">{mb.email}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                          <span>IMAP: {mb.imapHost}:{mb.imapPort}</span>
                          <span>-</span>
                          <span>SMTP: {mb.smtpHost}:{mb.smtpPort}</span>
                          {mb.lastSync && <span className="hidden sm:inline">- Last sync: {formatDate(mb.lastSync)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => void toggleActive(mb)}
                          className={cn("text-xs px-2 py-1 rounded-full font-medium transition-colors", mb.isActive ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}
                        >
                          {mb.isActive ? "Active" : "Inactive"}
                        </button>
                        <button onClick={() => openEdit(mb)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                        {confirmDeleteId === mb.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => void handleDelete(mb.id)} disabled={deleting === mb.id} className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">
                              {deleting === mb.id ? "..." : "Confirm"}
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-2 py-1 rounded border text-gray-500">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(mb.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center gap-2 px-3 pb-2.5">
                      <button
                        onClick={() => void testConnection(mb)}
                        disabled={testingId === mb.id}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:border-[#FE0000]/40 hover:text-[#FE0000] disabled:opacity-50 transition-colors"
                      >
                        {testingId === mb.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                        Test Connection
                      </button>
                      <button
                        onClick={() => void syncMailbox(mb, onSync)}
                        disabled={syncingId === mb.id || !mb.isActive}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:border-[#FE0000]/40 hover:text-[#FE0000] disabled:opacity-50 transition-colors"
                      >
                        {syncingId === mb.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Sync Now
                      </button>
                      {testResult[mb.id] && (
                        <span className={cn("text-xs ml-1", testResult[mb.id].ok ? "text-green-600" : "text-red-500")}>
                          {testResult[mb.id].ok ? "OK" : "Failed"} {testResult[mb.id].msg}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-1">
              <Button size="sm" style={{ backgroundColor: "#FE0000", color: "#fff" }} onClick={openCreate}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Add Mailbox
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex max-h-[calc(90vh-7rem)] flex-col overflow-hidden py-1">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MailboxTab)} className="flex min-h-0 flex-1 flex-col">
              <TabsList className="h-auto shrink-0 justify-start gap-1 overflow-x-auto rounded-none border-b border-gray-200 bg-transparent p-0">
                <TabsTrigger value="information" className="rounded-none border-b-2 border-transparent px-4 py-2 text-sm data-[state=active]:border-[#FE0000] data-[state=active]:bg-white data-[state=active]:text-[#c30000]">Information</TabsTrigger>
                <TabsTrigger value="filters" className="rounded-none border-b-2 border-transparent px-4 py-2 text-sm data-[state=active]:border-[#FE0000] data-[state=active]:bg-white data-[state=active]:text-[#c30000]">Filters</TabsTrigger>
                <TabsTrigger value="permissions" className="rounded-none border-b-2 border-transparent px-4 py-2 text-sm data-[state=active]:border-[#FE0000] data-[state=active]:bg-white data-[state=active]:text-[#c30000]">Permissions</TabsTrigger>
                <TabsTrigger value="signature" className="rounded-none border-b-2 border-transparent px-4 py-2 text-sm data-[state=active]:border-[#FE0000] data-[state=active]:bg-white data-[state=active]:text-[#c30000]">Signature</TabsTrigger>
                <TabsTrigger value="auto-reply" className="rounded-none border-b-2 border-transparent px-4 py-2 text-sm data-[state=active]:border-[#FE0000] data-[state=active]:bg-white data-[state=active]:text-[#c30000]">Auto-reply</TabsTrigger>
              </TabsList>

              <div className="min-h-0 flex-1 overflow-y-auto px-1 pt-3">
                <TabsContent value="information" className="mt-0 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="mb-name">Display Name *</Label>
                      <Input id="mb-name" placeholder="e.g. Support Inbox" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="mb-email">Email Address *</Label>
                      <Input id="mb-email" type="email" placeholder="support@company.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 p-3 space-y-2.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">IMAP (Incoming)</p>
                    <div className="grid grid-cols-[1fr_100px] gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Host *</Label>
                        <Input placeholder="imap.gmail.com" value={form.imapHost} onChange={(e) => set("imapHost", e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Port</Label>
                        <Input type="number" placeholder="993" value={form.imapPort} onChange={(e) => set("imapPort", e.target.value)} className="h-8 text-sm" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 p-3 space-y-2.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SMTP (Outgoing)</p>
                    <div className="grid grid-cols-[1fr_100px] gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Host *</Label>
                        <Input placeholder="smtp.gmail.com" value={form.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Port</Label>
                        <Input type="number" placeholder="587" value={form.smtpPort} onChange={(e) => set("smtpPort", e.target.value)} className="h-8 text-sm" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="mb-user">Username *</Label>
                      <Input id="mb-user" placeholder="your@email.com" value={form.username} onChange={(e) => set("username", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="mb-pass">{view === "edit" ? "Password (leave blank to keep)" : "Password *"}</Label>
                      <div className="relative">
                        <Input id="mb-pass" type={showPassword ? "text" : "password"} placeholder={view === "edit" ? "********" : "App password"} value={form.password} onChange={(e) => set("password", e.target.value)} className="pr-9" />
                        <button type="button" onClick={() => setShowPassword((p) => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={form.useSSL} onChange={(e) => set("useSSL", e.target.checked)} className="rounded" />
                    <span className="text-sm text-gray-700 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-green-600" />Use SSL/TLS</span>
                  </label>

                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 space-y-0.5">
                    <p className="font-medium">Gmail / Google Workspace</p>
                    <p>Use an App Password (not your account password). Enable IMAP in Gmail settings.</p>
                    <p className="mt-1 font-medium">Office 365 / Outlook</p>
                    <p>IMAP: outlook.office365.com:993 - SMTP: smtp.office365.com:587</p>
                  </div>
                </TabsContent>

                <TabsContent value="filters" className="mt-0 space-y-4">
                  <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                    <p className="text-sm font-medium text-gray-800">Folder sync options</p>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={extras.syncSent} onChange={(e) => setExtra("syncSent", e.target.checked)} />Sync Sent</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={extras.syncDrafts} onChange={(e) => setExtra("syncDrafts", e.target.checked)} />Sync Drafts</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={extras.syncSpam} onChange={(e) => setExtra("syncSpam", e.target.checked)} />Sync Spam</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={extras.syncTrash} onChange={(e) => setExtra("syncTrash", e.target.checked)} />Sync Trash</label>
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                    <p className="text-sm font-medium text-gray-800">Incoming keyword rule</p>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-500">Match keywords (comma separated)</Label>
                      <Input
                        placeholder="invoice, statement, notification"
                        value={extras.filterKeywords}
                        onChange={(e) => setExtra("filterKeywords", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-500">Move matched emails to</Label>
                      <Select value={extras.filterMoveTo} onValueChange={(v) => setExtra("filterMoveTo", (v as StatusId) ?? "inbox")}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inbox">Inbox</SelectItem>
                          <SelectItem value="spam">Spam</SelectItem>
                          <SelectItem value="deleted">Trash</SelectItem>
                          <SelectItem value="all">All Mail</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="permissions" className="mt-0 space-y-4">
                  <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                    <p className="text-sm font-medium text-gray-800">Mailbox visibility</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: "private", label: "Private" },
                        { id: "team", label: "Team" },
                        { id: "custom", label: "Custom" },
                      ].map((scope) => (
                        <button
                          key={scope.id}
                          type="button"
                          onClick={() => setExtra("permissionScope", scope.id as MailboxPermissionScope)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs transition-colors",
                            extras.permissionScope === scope.id
                              ? "border-[#FE0000]/35 bg-[#FE0000]/10 text-[#c30000]"
                              : "border-gray-200 text-gray-600 hover:border-[#FE0000]/25 hover:text-[#c30000]"
                          )}
                        >
                          {scope.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-3">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={extras.permissionCanRead} onChange={(e) => setExtra("permissionCanRead", e.target.checked)} />Can read</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={extras.permissionCanCompose} onChange={(e) => setExtra("permissionCanCompose", e.target.checked)} />Can compose</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={extras.permissionCanManage} onChange={(e) => setExtra("permissionCanManage", e.target.checked)} />Can manage</label>
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    Permissions are saved for mailbox profile settings and used by the UI module scope.
                  </div>
                </TabsContent>

                <TabsContent value="signature" className="mt-0 space-y-3">
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="relative border-b bg-gray-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-gray-500">
                        <button type="button" className="rounded border border-gray-200 px-2 py-1 text-xs hover:border-[#FE0000]/30 hover:text-[#c30000]" onClick={() => setShowSignatureLink((v) => !v)}>
                          <Link2 className="mr-1 inline-block h-3.5 w-3.5" />Link
                        </button>
                        <button type="button" className="rounded border border-gray-200 px-2 py-1 text-xs hover:border-[#FE0000]/30 hover:text-[#c30000]" onClick={() => setShowSignatureImage((v) => !v)}>
                          <ImageIcon className="mr-1 inline-block h-3.5 w-3.5" />Image
                        </button>
                        <button type="button" className="rounded border border-gray-200 px-2 py-1 text-xs hover:border-[#FE0000]/30 hover:text-[#c30000]" onClick={() => setShowSignatureEmoji((v) => !v)}>
                          <Smile className="mr-1 inline-block h-3.5 w-3.5" />Emoji
                        </button>
                        <button type="button" className="rounded border border-gray-200 px-2 py-1 text-xs hover:border-[#FE0000]/30 hover:text-[#c30000]" onClick={() => insertIntoSignature("\n---\n")}>
                          <span className="mr-1">-</span>Separator
                        </button>
                      </div>

                      {showSignatureLink && (
                        <div className="absolute left-3 top-11 z-30 w-[320px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                          <p className="mb-2 text-xs font-medium text-gray-600">Insert link</p>
                          <Input
                            placeholder="Text"
                            value={signatureLinkText}
                            onChange={(e) => setSignatureLinkText(e.target.value)}
                            className="mb-2 h-8 text-sm"
                          />
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="Type or paste a link"
                              value={signatureLinkUrl}
                              onChange={(e) => setSignatureLinkUrl(e.target.value)}
                              className="h-8 text-sm"
                            />
                            <Button type="button" size="sm" onClick={applySignatureLink} style={{ backgroundColor: "#FE0000", color: "#fff" }}>Apply</Button>
                          </div>
                        </div>
                      )}

                      {showSignatureImage && (
                        <div className="absolute left-3 top-11 z-30 w-[340px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                          <p className="mb-2 text-xs font-medium text-gray-600">Insert image by URL</p>
                          <Input
                            placeholder="Image alt text"
                            value={signatureImageAlt}
                            onChange={(e) => setSignatureImageAlt(e.target.value)}
                            className="mb-2 h-8 text-sm"
                          />
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="https://..."
                              value={signatureImageUrl}
                              onChange={(e) => setSignatureImageUrl(e.target.value)}
                              className="h-8 text-sm"
                            />
                            <Button type="button" size="sm" onClick={applySignatureImage} style={{ backgroundColor: "#FE0000", color: "#fff" }}>Apply</Button>
                          </div>
                        </div>
                      )}

                      {showSignatureEmoji && (
                        <div className="absolute left-3 top-11 z-30 w-[360px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                          <div className="mb-2">
                            <Input
                              placeholder="Search emoji"
                              value={signatureEmojiSearch}
                              onChange={(e) => setSignatureEmojiSearch(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="mb-2 flex flex-wrap gap-1">
                            {EMOJI_CATEGORY_ITEMS.map((item) => (
                              <button
                                key={`sig-${item.id}`}
                                type="button"
                                title={item.label}
                                onClick={() => setSignatureEmojiCategory(item.id)}
                                className={cn(
                                  "inline-flex h-7 w-7 items-center justify-center rounded text-sm",
                                  signatureEmojiCategory === item.id
                                    ? "bg-[#FE0000]/10 text-[#c30000]"
                                    : "hover:bg-gray-100"
                                )}
                              >
                                {item.icon}
                              </button>
                            ))}
                          </div>
                          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                            {EMOJI_CATEGORY_ITEMS.find((item) => item.id === signatureEmojiCategory)?.label ?? "Emojis"}
                          </p>
                          <div className="grid max-h-52 grid-cols-8 gap-1 overflow-y-auto pr-1">
                            {signatureEmojiPool.map((emoji) => (
                              <button
                                key={`sig-emoji-${emoji}`}
                                type="button"
                                className="h-8 w-8 rounded text-lg hover:bg-gray-100"
                                onClick={() => pickSignatureEmoji(emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                            {signatureEmojiPool.length === 0 && (
                              <p className="col-span-8 py-4 text-center text-xs text-gray-400">No emoji found.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <Textarea
                      ref={signatureRef}
                      rows={12}
                      value={extras.signature}
                      onChange={(e) => setExtra("signature", e.target.value)}
                      className="min-h-[260px] resize-none rounded-none border-0 focus-visible:ring-0"
                    />
                  </div>
                  <div className="rounded-lg border border-[#FE0000]/20 bg-[#fff8f8] px-3 py-2 text-xs text-[#c30000]">
                    Valid macros: <span className="font-medium">#name#, #surname#, #fullname#, #replyname#, #company#, #department#, #position#</span>
                  </div>
                </TabsContent>

                <TabsContent value="auto-reply" className="mt-0 space-y-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={extras.autoReplyEnabled} onChange={(e) => setExtra("autoReplyEnabled", e.target.checked)} className="rounded" />
                    <span className="text-sm font-medium text-gray-800">Enable auto-reply for this mailbox</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Start date</Label>
                      <Input type="date" value={extras.autoReplyStartDate} onChange={(e) => setExtra("autoReplyStartDate", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>End date</Label>
                      <Input type="date" value={extras.autoReplyEndDate} onChange={(e) => setExtra("autoReplyEndDate", e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Auto-reply subject</Label>
                    <Input
                      placeholder="Thanks for reaching out"
                      value={extras.autoReplySubject}
                      onChange={(e) => setExtra("autoReplySubject", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Auto-reply message</Label>
                    <Textarea
                      rows={8}
                      placeholder="I am currently away from email..."
                      value={extras.autoReplyBody}
                      onChange={(e) => setExtra("autoReplyBody", e.target.value)}
                      className="resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Default inbox category</Label>
                    <Select value={extras.defaultInboxLabel} onValueChange={(v) => setExtra("defaultInboxLabel", (v as MailboxLabel) ?? "primary")}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary">Primary</SelectItem>
                        <SelectItem value="social">Social</SelectItem>
                        <SelectItem value="promotions">Promotions</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter className="shrink-0 border-t pt-3">
              <Button type="button" variant="outline" onClick={() => setView("list")} disabled={saving}>Cancel</Button>
              <Button type="button" style={{ backgroundColor: "#FE0000", color: "#fff" }} onClick={() => void handleSave()} disabled={saving}>
                {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving...</> : view === "create" ? "Add Mailbox" : "Save Changes"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Recipient Chip Input ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

function RecipientInput({
  label,
  chips,
  onAdd,
  onRemove,
  users,
  placeholder,
  error,
  onClearError,
}: {
  label: string; chips: RecipientChip[];
  onAdd: (c: RecipientChip) => void; onRemove: (id: string) => void;
  users: TeamUser[]; placeholder?: string; error?: string; onClearError?: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return users.filter((u) => !chips.some((c) => c.userId === u.id))
      .filter((u) => displayName(u).toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, users, chips]);

  const open = filtered.length > 0 && query.trim().length > 0;

  function tryAddByText(raw: string) {
    const q = raw.trim();
    if (!q) return false;
    const normalized = q.toLowerCase();
    const match = users.find((u) =>
      !chips.some((c) => c.userId === u.id) &&
      (u.email.toLowerCase() === normalized ||
        displayName(u).toLowerCase() === normalized ||
        u.name.toLowerCase() === normalized)
    );
    if (!match) return false;
    onAdd({ userId: match.id, email: match.email, name: displayName(match) });
    onClearError?.();
    return true;
  }

  function tryAddExternalEmail(raw: string) {
    const q = raw.trim();
    if (!isValidEmail(q)) return false;
    const normalized = q.toLowerCase();
    const exists = chips.some((c) => c.email.toLowerCase() === normalized);
    if (exists) return true;
    onAdd({
      userId: `external:${normalized}`,
      email: normalized,
      name: normalized,
      external: true,
    });
    onClearError?.();
    return true;
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-500">{label}</Label>
      <div className="relative">
        <div className="min-h-9 flex flex-wrap gap-1.5 items-center border border-gray-200 rounded-lg px-2 py-1.5 focus-within:border-[#FE0000]/40 focus-within:ring-1 focus-within:ring-[#FE0000]/20 transition-all">
          {chips.map((chip) => (
            <span key={chip.userId} className="inline-flex items-center gap-1 bg-[#FE0000]/10 text-[#c30000] text-xs rounded-full px-2 py-0.5">
              {chip.name}
              <button type="button" onClick={() => onRemove(chip.userId)}><X className="h-2.5 w-2.5" /></button>
            </span>
          ))}
          <input
            className="flex-1 min-w-24 text-sm outline-none bg-transparent placeholder:text-gray-400"
            placeholder={chips.length === 0 ? placeholder : ""}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onClearError?.();
            }}
            onBlur={() => {
              if (!query.trim()) return;
              if (tryAddByText(query)) {
                setQuery("");
                return;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !query && chips.length > 0) {
                onRemove(chips[chips.length - 1].userId);
                return;
              }
              if (["Enter", "Tab", ","].includes(e.key)) {
                if (!query.trim()) return;
                e.preventDefault();
                if (tryAddByText(query)) {
                  setQuery("");
                } else if (tryAddExternalEmail(query)) {
                  setQuery("");
                } else {
                  toast.error("Enter a valid email or select a team member.");
                }
              }
            }}
          />
        </div>
        {open && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            {filtered.map((u) => (
              <button key={u.id} type="button"
                onMouseDown={(e) => { e.preventDefault(); onAdd({ userId: u.id, email: u.email, name: displayName(u) }); setQuery(""); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-left"
              >
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarFallback className={cn("text-xs", avatarColor(displayName(u)))}>{initials(displayName(u))}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{displayName(u)}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Compose Dialog ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

type ComposePrefill = {
  to?: RecipientChip[];
  subject?: string;
  body?: string;
  parentId?: string;
  threadId?: string;
  mailboxId?: string;
};

type ComposeAttachment = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  dataUrl: string;
};

function ComposeDialog({ open, onClose, onSent, onDrafted, users, prefill, mailboxes }: {
  open: boolean; onClose: () => void;
  onSent: (e: EmailItem) => void; onDrafted: (e: EmailItem) => void;
  users: TeamUser[]; prefill?: ComposePrefill; mailboxes: Mailbox[];
}) {
  const [to, setTo] = useState<RecipientChip[]>([]);
  const [cc, setCc] = useState<RecipientChip[]>([]);
  const [bcc, setBcc] = useState<RecipientChip[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [mailboxId, setMailboxId] = useState("");
  const [recipientError, setRecipientError] = useState("");
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const [richBodyHtml, setRichBodyHtml] = useState("");
  const [editorMountKey, setEditorMountKey] = useState(0);
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontSize, setFontSize] = useState("3");
  const [textColor, setTextColor] = useState("#202124");
  const [composeLabel, setComposeLabel] = useState<InboxCategoryId>("primary");
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [showImagePopover, setShowImagePopover] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [emojiCategory, setEmojiCategory] = useState<EmojiCategoryId>("recent");
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(true);
  const [plainTextMode, setPlainTextMode] = useState(false);
  const [defaultFullscreen, setDefaultFullscreen] = useState(false);
  const [showSendMenu, setShowSendMenu] = useState(false);
  const [mailboxExtrasMap, setMailboxExtrasMap] = useState<Record<string, MailboxExtras>>({});
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement | null>(null);
  const richEditorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const linkPopoverRef = useRef<HTMLDivElement | null>(null);
  const imagePopoverRef = useRef<HTMLDivElement | null>(null);
  const emojiPopoverRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const sendMenuRef = useRef<HTMLDivElement | null>(null);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiTone, setAiTone] = useState("professional");
  const [aiLength, setAiLength] = useState("standard");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<{ subject: string; body: string } | null>(null);

  useEffect(() => {
    if (open) {
      const initialBody = prefill?.body ?? "";
      const initialHtml = /<\/?[a-z][\s\S]*>/i.test(initialBody)
        ? initialBody
        : plainTextToHtml(initialBody);
      setTo(prefill?.to ?? []);
      setCc([]);
      setBcc([]);
      setShowCc(false);
      setShowBcc(false);
      setSubject(prefill?.subject ?? "");
      setBody(/<\/?[a-z][\s\S]*>/i.test(initialBody) ? htmlToPlainText(initialBody) : initialBody);
      setRichBodyHtml(initialHtml);
      setEditorMountKey((prev) => prev + 1);
      setFontFamily("Arial");
      setFontSize("3");
      setTextColor("#202124");
      setComposeLabel("primary");
      const activeMailbox = mailboxes.find((m) => m.isActive);
      setMailboxId(prefill?.mailboxId ?? activeMailbox?.id ?? "");
      setRecipientError("");
      setAttachments([]);
      setShowLinkPopover(false);
      setShowImagePopover(false);
      setLinkText("");
      setLinkUrl("");
      setImageAlt("");
      setImageUrl("");
      setShowEmojiPicker(false);
      setEmojiSearch("");
      setEmojiCategory("recent");
      setShowMoreMenu(false);
      setShowSendMenu(false);
      setSpellCheckEnabled(true);
      setPlainTextMode(false);
      setDefaultFullscreen(false);
      setMailboxExtrasMap(loadMailboxExtrasMap());
      setAiOpen(false);
      setAiResult(null);
      setAiPrompt("");
      try {
        const raw = window.localStorage.getItem("zeddash_recent_emojis_v1");
        if (raw) {
          const parsed = JSON.parse(raw) as string[];
          if (Array.isArray(parsed)) setRecentEmojis(parsed.slice(0, 24));
        } else {
          setRecentEmojis([]);
        }
      } catch {
        setRecentEmojis([]);
      }
    }
  }, [open, prefill, mailboxes]);

  useEffect(() => {
    if (!open || plainTextMode) return;
    const editor = richEditorRef.current;
    if (!editor) return;
    // Only reset innerHTML on mount/mode-switch/key change — NOT on every richBodyHtml update
    editor.innerHTML = richBodyHtml || "<p><br></p>";
    // Place cursor at end
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plainTextMode, editorMountKey]);

  useEffect(() => {
    if (!open) return;
    const shouldWatch =
      showLinkPopover || showImagePopover || showEmojiPicker || showMoreMenu || showSendMenu;
    if (!shouldWatch) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        linkPopoverRef.current?.contains(target) ||
        imagePopoverRef.current?.contains(target) ||
        emojiPopoverRef.current?.contains(target) ||
        moreMenuRef.current?.contains(target) ||
        sendMenuRef.current?.contains(target)
      ) {
        return;
      }
      setShowLinkPopover(false);
      setShowImagePopover(false);
      setShowEmojiPicker(false);
      setShowMoreMenu(false);
      setShowSendMenu(false);
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, showLinkPopover, showImagePopover, showEmojiPicker, showMoreMenu, showSendMenu]);

  function appendToBody(text: string) {
    if (plainTextMode) {
      setBody((prev) => (prev ? `${prev}${prev.endsWith("\n") ? "" : "\n"}${text}` : text));
      return;
    }
    const html = plainTextToHtml(text);
    runRichCommand("insertHTML", `${html}<br/>`);
  }

  function insertIntoBody(text: string) {
    if (!plainTextMode) {
      runRichCommand("insertText", text);
      return;
    }
    setBody((prev) => {
      const el = bodyInputRef.current;
      if (!el) {
        return prev ? `${prev}${prev.endsWith("\n") ? "" : "\n"}${text}` : text;
      }
      const start = el.selectionStart ?? prev.length;
      const end = el.selectionEnd ?? prev.length;
      const next = `${prev.slice(0, start)}${text}${prev.slice(end)}`;
      const cursor = start + text.length;
      queueMicrotask(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
      return next;
    });
  }

  function applyLinkToBody() {
    if (!isHttpUrl(linkUrl)) {
      toast.error("Enter a valid URL (http or https).");
      return;
    }
    const label = linkText.trim() || linkUrl.trim();
    if (plainTextMode) {
      insertIntoBody(`[${label}](${linkUrl.trim()})`);
    } else {
      runRichCommand(
        "insertHTML",
        `<a href="${linkUrl.trim()}" target="_blank" rel="noreferrer">${escapeHtmlText(label)}</a>`
      );
    }
    setShowLinkPopover(false);
    setLinkText("");
    setLinkUrl("");
  }

  function applyImageToBody() {
    if (!isHttpUrl(imageUrl)) {
      toast.error("Enter a valid image URL (http or https).");
      return;
    }
    const alt = imageAlt.trim() || "image";
    if (plainTextMode) {
      insertIntoBody(`![${alt}](${imageUrl.trim()})`);
    } else {
      runRichCommand(
        "insertHTML",
        `<img src="${imageUrl.trim()}" alt="${escapeHtmlText(alt)}" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #e5e7eb;" />`
      );
    }
    setShowImagePopover(false);
    setImageAlt("");
    setImageUrl("");
  }

  function addEmojiToBody(emoji: string) {
    insertIntoBody(emoji);
    const next = [emoji, ...recentEmojis.filter((e) => e !== emoji)].slice(0, 24);
    setRecentEmojis(next);
    try {
      window.localStorage.setItem("zeddash_recent_emojis_v1", JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }

  function runRichCommand(command: string, value?: string) {
    const editor = richEditorRef.current;
    if (!editor) return;
    editor.focus();
    // Restore selection if toolbar click stole it from the editor
    const sel = window.getSelection();
    if (savedRangeRef.current && (!sel?.rangeCount || !editor.contains(sel.anchorNode))) {
      sel?.removeAllRanges();
      sel?.addRange(savedRangeRef.current);
    }
    document.execCommand(command, false, value);
    savedRangeRef.current = null;
    setRichBodyHtml(editor.innerHTML);
  }

  function togglePlainTextEditor() {
    if (plainTextMode) {
      const html = plainTextToHtml(body);
      setRichBodyHtml(html);
      setPlainTextMode(false);
      setEditorMountKey((prev) => prev + 1);
      return;
    }
    const html = richEditorRef.current?.innerHTML ?? richBodyHtml;
    setBody(htmlToPlainText(html));
    setPlainTextMode(true);
  }

  function printComposeDraft() {
    const htmlBody = plainTextMode
      ? plainTextToHtml(body)
      : (richEditorRef.current?.innerHTML ?? richBodyHtml);
    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) {
      toast.error("Unable to open print preview popup.");
      return;
    }
    popup.document.write(
      `<!doctype html><html><head><title>${escapeHtmlText(subject || "New Message")}</title><meta charset="utf-8"/></head><body style="font-family:Arial,sans-serif;padding:24px;"><h2>${escapeHtmlText(subject || "(No subject)")}</h2><hr/>${htmlBody}</body></html>`
    );
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function insertMeetingBlock() {
    const when = window.prompt("Enter date and time for meeting (e.g. Tue, Mar 17 at 3:00 PM):");
    if (!when) return;
    const link = window.prompt("Paste meeting link (optional):")?.trim() ?? "";
    if (plainTextMode) {
      appendToBody(`Meeting proposal:\n${when}${link ? `\n${link}` : ""}`);
      return;
    }
    runRichCommand(
      "insertHTML",
      `<div style="border:1px solid #fecaca;background:#fff8f8;border-radius:8px;padding:10px 12px;margin:8px 0;"><strong>Meeting proposal</strong><div>${escapeHtmlText(when)}</div>${link ? `<a href="${link}" target="_blank" rel="noreferrer">${escapeHtmlText(link)}</a>` : ""}</div>`
    );
  }

  async function handleAttachmentFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: ComposeAttachment[] = [];
    for (const file of Array.from(files)) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Failed to read attachment"));
        reader.readAsDataURL(file);
      });
      next.push({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        dataUrl,
      });
    }
    setAttachments((prev) => [...prev, ...next]);
  }

  async function handleSend(isDraft = false) {
    const composedBody = plainTextMode
      ? body.trim()
      : (richEditorRef.current?.innerHTML ?? richBodyHtml).trim();
    const composedBodyText = plainTextMode ? body.trim() : htmlToPlainText(composedBody).trim();

    if (!subject.trim() || !composedBodyText) {
      toast.error("Subject and message required");
      return;
    }
    if (!isDraft && to.length === 0 && cc.length === 0 && bcc.length === 0) {
      setRecipientError("Please add at least one recipient.");
      toast.error("Add at least one recipient");
      return;
    }
    if (!mailboxId && !isDraft) {
      toast.error("Select a sending mailbox");
      return;
    }
    setRecipientError("");

    const toUserIds = to.filter((c) => !c.external).map((c) => c.userId);
    const ccUserIds = cc.filter((c) => !c.external).map((c) => c.userId);
    const bccUserIds = bcc.filter((c) => !c.external).map((c) => c.userId);
    const toEmails = to.filter((c) => c.external).map((c) => c.email);
    const ccEmails = cc.filter((c) => c.external).map((c) => c.email);
    const bccEmails = bcc.filter((c) => c.external).map((c) => c.email);

    if (isDraft) {
      setSavingDraft(true);
    } else {
      setSending(true);
    }
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          body: composedBody,
          toUserIds,
          ccUserIds,
          bccUserIds,
          toEmails,
          ccEmails,
          bccEmails,
          attachments,
          mailboxId: mailboxId || undefined,
          parentId: prefill?.parentId,
          threadId: prefill?.threadId,
          isDraft,
        }),
      });

      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(e?.error ?? "Failed");
      }

      const email = (await res.json()) as EmailItem;
      if (isDraft) {
        toast.success("Saved as draft");
        onDrafted(email);
      } else {
        toast.success("Email sent");
        onSent(email);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      if (isDraft) {
        setSavingDraft(false);
      } else {
        setSending(false);
      }
    }
  }

  async function handleAiGenerate() {
    if (!aiPrompt.trim()) {
      toast.error("Describe what to write");
      return;
    }
    setAiGenerating(true);
    try {
      const res = await fetch("/api/email/ai/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, tone: aiTone, length: aiLength }),
      });
      if (!res.ok) throw new Error();
      setAiResult((await res.json()) as { subject: string; body: string });
    } catch {
      toast.error("AI unavailable - try again");
    } finally {
      setAiGenerating(false);
    }
  }

  const selectedMailboxExtras = mailboxId ? mailboxExtrasMap[mailboxId] : undefined;
  const composeBodyTextPreview = plainTextMode ? body.trim() : htmlToPlainText(richBodyHtml).trim();
  const emojiPool = useMemo(() => {
    const source = emojiCategory === "recent" ? recentEmojis : EMOJI_LIBRARY[emojiCategory];
    const q = emojiSearch.trim().toLowerCase();
    if (!q) return source;
    return source.filter((emoji) => emoji.toLowerCase().includes(q));
  }, [emojiCategory, emojiSearch, recentEmojis]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 overflow-hidden border border-gray-300 p-0 shadow-2xl",
          defaultFullscreen
            ? "!left-4 !top-4 !right-4 !bottom-4 !translate-x-0 !translate-y-0 h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none rounded-xl"
            : "!left-auto !top-auto !right-4 !bottom-4 md:!bottom-6 !translate-x-0 !translate-y-0 h-[min(80vh,calc(100vh-2.75rem))] w-[92vw] max-w-[760px] rounded-xl"
        )}
      >
        <DialogHeader className="border-b bg-[#f2f2f2] px-4 py-2.5">
          <DialogTitle className="flex items-center justify-between text-sm font-medium text-gray-700">
            <span>New Message</span>
            <div className="flex items-center gap-1">
              <button className="rounded p-1 text-gray-500 hover:bg-gray-200" title="Minimize">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button className="rounded p-1 text-gray-500 hover:bg-gray-200" title="Options">
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
              <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-200" title="Close">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-0 overflow-y-auto bg-white">
          <div className="border-b px-4 py-2.5">
            <button
              onClick={() => setAiOpen((p) => !p)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all",
                aiOpen
                  ? "border-[#FE0000]/30 bg-[#FE0000]/10 text-[#c30000]"
                  : "border-gray-200 text-gray-500 hover:border-[#FE0000]/30 hover:text-[#c30000]"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" /> AI Compose
            </button>
          </div>

          {aiOpen && (
            <div className="border-b border-[#FE0000]/20 bg-[#fff8f8] p-4 space-y-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-[#c30000]"><Sparkles className="h-4 w-4" />AI Compose Assistant</p>
              <div className="space-y-1.5">
                <Label className="text-xs">What do you want to write? *</Label>
                <Textarea rows={3} placeholder="e.g. Follow up on the Q4 proposal, ask for decision timeline..." value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} className="resize-none text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tone</Label>
                  <Select value={aiTone} onValueChange={(v) => setAiTone(v ?? "professional")}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["professional", "friendly", "formal", "casual", "assertive"].map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Length</Label>
                  <Select value={aiLength} onValueChange={(v) => setAiLength(v ?? "standard")}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="brief">Brief</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="detailed">Detailed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {aiResult ? (
                <div className="space-y-2">
                  <div className="space-y-1 rounded-lg border bg-white p-3 text-sm">
                    <p className="font-medium text-gray-700">Subject: <span className="font-normal text-gray-600">{aiResult.subject}</span></p>
                    <p className="text-xs leading-relaxed text-gray-600 whitespace-pre-line">{aiResult.body.slice(0, 280)}{aiResult.body.length > 280 ? "..." : ""}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      style={{ backgroundColor: "#FE0000", color: "#fff" }}
                      onClick={() => {
                        if (!subject) setSubject(aiResult.subject);
                        setBody(aiResult.body);
                        setRichBodyHtml(plainTextToHtml(aiResult.body));
                        if (!plainTextMode) {
                          setEditorMountKey((prev) => prev + 1);
                        }
                        setAiOpen(false);
                        setAiResult(null);
                      }}
                    >
                      Use Draft
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void handleAiGenerate()} disabled={aiGenerating}><RotateCcw className="mr-1 h-3 w-3" />Regenerate</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAiResult(null)}>Discard</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" style={{ backgroundColor: "#FE0000", color: "#fff" }} onClick={() => void handleAiGenerate()} disabled={aiGenerating || !aiPrompt.trim()}>
                  {aiGenerating ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Generating...</> : <><Sparkles className="mr-1.5 h-3.5 w-3.5" />Generate Draft</>}
                </Button>
              )}
            </div>
          )}

          <div className="border-b px-4 py-2">
            <div className="mb-2 flex items-center gap-2">
              <Label className="w-10 text-xs text-gray-500">From</Label>
              <Select value={mailboxId} onValueChange={(v) => setMailboxId(v ?? "")} items={Object.fromEntries(mailboxes.filter((m) => m.isActive).map((mb) => [mb.id, `${mb.name} (${mb.email})`]))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select mailbox" />
                </SelectTrigger>
                <SelectContent>
                  {mailboxes.filter((m) => m.isActive).map((mb) => (
                    <SelectItem key={mb.id} value={mb.id}>
                      {mb.name} ({mb.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <RecipientInput
              label="To *"
              chips={to}
              onAdd={(c) => {
                setTo((p) => [...p, c]);
                setRecipientError("");
              }}
              onRemove={(id) => setTo((p) => p.filter((c) => c.userId !== id))}
              users={users}
              placeholder="Recipients"
              error={recipientError}
              onClearError={() => setRecipientError("")}
            />
            <div className="mt-1.5 flex gap-3 text-xs">
              {!showCc && <button type="button" onClick={() => setShowCc(true)} className="text-[#FE0000] hover:underline">Cc</button>}
              {!showBcc && <button type="button" onClick={() => setShowBcc(true)} className="text-[#FE0000] hover:underline">Bcc</button>}
            </div>
          </div>
          {showCc && (
            <div className="border-b px-4 py-2">
              <div className="flex items-start gap-2">
                <div className="flex-1"><RecipientInput label="Cc" chips={cc} onAdd={(c) => setCc((p) => [...p, c])} onRemove={(id) => setCc((p) => p.filter((c) => c.userId !== id))} users={users} placeholder="Recipients" onClearError={() => setRecipientError("")} /></div>
                <button type="button" onClick={() => { setShowCc(false); setCc([]); }} className="mt-5 text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}
          {showBcc && (
            <div className="border-b px-4 py-2">
              <div className="flex items-start gap-2">
                <div className="flex-1"><RecipientInput label="Bcc" chips={bcc} onAdd={(c) => setBcc((p) => [...p, c])} onRemove={(id) => setBcc((p) => p.filter((c) => c.userId !== id))} users={users} placeholder="Recipients" onClearError={() => setRecipientError("")} /></div>
                <button type="button" onClick={() => { setShowBcc(false); setBcc([]); }} className="mt-5 text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}
          <div className="border-b px-4 py-1.5">
            <Input id="compose-subject" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 border-0 px-0 shadow-none focus-visible:ring-0" />
            <div className="pb-1">
              <Badge variant="secondary" className="mt-0.5 text-[10px] uppercase tracking-wide bg-[#FE0000]/10 text-[#c30000]">
                {composeLabel}
              </Badge>
            </div>
          </div>
          <div className="px-4 py-3">
            {!plainTextMode && (
              <div className="mb-2 rounded-xl border border-gray-200 bg-gray-50 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-1">
                  <button type="button" className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-white" onClick={() => runRichCommand("undo")} title="Undo">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-white" onClick={() => runRichCommand("redo")} title="Redo">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <div className="mx-1 h-5 w-px bg-gray-200" />
                  <select
                    className="h-7 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700"
                    value={fontFamily}
                    onChange={(e) => {
                      setFontFamily(e.target.value);
                      runRichCommand("fontName", e.target.value);
                    }}
                  >
                    <option value="Arial">Sans Serif</option>
                    <option value="Georgia">Serif</option>
                    <option value="Courier New">Monospace</option>
                    <option value="Tahoma">Tahoma</option>
                    <option value="Verdana">Verdana</option>
                  </select>
                  <select
                    className="h-7 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700"
                    value={fontSize}
                    onChange={(e) => {
                      setFontSize(e.target.value);
                      runRichCommand("fontSize", e.target.value);
                    }}
                  >
                    <option value="1">8</option>
                    <option value="2">10</option>
                    <option value="3">12</option>
                    <option value="4">14</option>
                    <option value="5">18</option>
                    <option value="6">24</option>
                    <option value="7">32</option>
                  </select>
                  <div className="mx-1 h-5 w-px bg-gray-200" />
                  <button type="button" className="rounded px-2 py-1 text-xs font-bold text-gray-700 hover:bg-white" onClick={() => runRichCommand("bold")} title="Bold">B</button>
                  <button type="button" className="rounded px-2 py-1 text-xs italic text-gray-700 hover:bg-white" onClick={() => runRichCommand("italic")} title="Italic">I</button>
                  <button type="button" className="rounded px-2 py-1 text-xs underline text-gray-700 hover:bg-white" onClick={() => runRichCommand("underline")} title="Underline">U</button>
                  <label className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-700 hover:bg-white">
                    A
                    <input
                      type="color"
                      value={textColor}
                      className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0"
                      onChange={(e) => {
                        setTextColor(e.target.value);
                        runRichCommand("foreColor", e.target.value);
                      }}
                    />
                  </label>
                  <div className="mx-1 h-5 w-px bg-gray-200" />
                  <button type="button" className="rounded px-2 py-1 text-xs text-gray-700 hover:bg-white" onClick={() => runRichCommand("justifyLeft")} title="Align left">L</button>
                  <button type="button" className="rounded px-2 py-1 text-xs text-gray-700 hover:bg-white" onClick={() => runRichCommand("justifyCenter")} title="Align center">C</button>
                  <button type="button" className="rounded px-2 py-1 text-xs text-gray-700 hover:bg-white" onClick={() => runRichCommand("justifyRight")} title="Align right">R</button>
                  <button type="button" className="rounded px-2 py-1 text-xs text-gray-700 hover:bg-white" onClick={() => runRichCommand("insertUnorderedList")} title="Bulleted list">•</button>
                  <button type="button" className="rounded px-2 py-1 text-xs text-gray-700 hover:bg-white" onClick={() => runRichCommand("insertOrderedList")} title="Numbered list">1.</button>
                </div>
              </div>
            )}
            {plainTextMode ? (
              <Textarea
                ref={bodyInputRef}
                id="compose-body"
                rows={14}
                placeholder="Compose email (plain text mode)"
                value={body}
                spellCheck={spellCheckEnabled}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[280px] resize-none border-0 px-0 shadow-none focus-visible:ring-0"
              />
            ) : (
              <div className="min-h-[280px] rounded-xl border border-gray-200 bg-white">
                <div
                  key={editorMountKey}
                  ref={richEditorRef}
                  dir="ltr"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={spellCheckEnabled}
                  className="min-h-[280px] whitespace-pre-wrap break-words p-3 text-sm leading-relaxed text-gray-800 outline-none"
                  onInput={(e) => setRichBodyHtml((e.currentTarget as HTMLDivElement).innerHTML)}
                  onBlur={() => {
                    const sel = window.getSelection();
                    if (sel?.rangeCount) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
                  }}
                />
              </div>
            )}
            {attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {attachments.map((att, idx) => (
                  <span key={`${att.fileName}-${idx}`} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700">
                    <Paperclip className="h-3.5 w-3.5 text-gray-500" />
                    <span className="max-w-[220px] truncate">{att.fileName}</span>
                    <span className="text-gray-400">({formatFileSize(att.fileSize)})</span>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-red-500"
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                      title="Remove attachment"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between border-t bg-white px-4 pt-2.5 pb-4">
          <div className="flex items-center gap-1.5 text-gray-400">
            <input
              ref={attachmentInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleAttachmentFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            <button
              className="rounded p-1.5 hover:bg-gray-100 hover:text-gray-600"
              title="Attach"
              onClick={() => attachmentInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <div className="relative" ref={linkPopoverRef}>
              <button
                className="rounded p-1.5 hover:bg-gray-100 hover:text-gray-600"
                title="Insert link"
                onClick={() => {
                  setShowLinkPopover((v) => !v);
                  setShowImagePopover(false);
                  setShowEmojiPicker(false);
                  setShowMoreMenu(false);
                }}
              >
                <Link2 className="h-4 w-4" />
              </button>
              {showLinkPopover && (
                <div className="absolute bottom-9 left-0 z-20 w-[340px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                  <Input
                    placeholder="Text"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    className="mb-2 h-9 text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Type or paste a link"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <Button type="button" size="sm" style={{ backgroundColor: "#FE0000", color: "#fff" }} onClick={applyLinkToBody}>
                      Apply
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={imagePopoverRef}>
              <button
                className="rounded p-1.5 hover:bg-gray-100 hover:text-gray-600"
                title="Insert image"
                onClick={() => {
                  setShowImagePopover((v) => !v);
                  setShowLinkPopover(false);
                  setShowEmojiPicker(false);
                  setShowMoreMenu(false);
                }}
              >
                <ImageIcon className="h-4 w-4" />
              </button>
              {showImagePopover && (
                <div className="absolute bottom-9 left-0 z-20 w-[360px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                  <Input
                    placeholder="Image alt text"
                    value={imageAlt}
                    onChange={(e) => setImageAlt(e.target.value)}
                    className="mb-2 h-9 text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="https://..."
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <Button type="button" size="sm" style={{ backgroundColor: "#FE0000", color: "#fff" }} onClick={applyImageToBody}>
                      Apply
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={emojiPopoverRef}>
              <button
                className="rounded p-1.5 hover:bg-gray-100 hover:text-gray-600"
                title="Insert emoji"
                onClick={() => {
                  setShowEmojiPicker((v) => !v);
                  setShowLinkPopover(false);
                  setShowImagePopover(false);
                  setShowMoreMenu(false);
                }}
              >
                <Smile className="h-4 w-4" />
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-9 left-0 z-20 w-[360px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                  <div className="mb-2">
                    <Input
                      placeholder="Search"
                      value={emojiSearch}
                      onChange={(e) => setEmojiSearch(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-1">
                    {EMOJI_CATEGORY_ITEMS.map((item) => (
                      <button
                        key={`compose-emoji-${item.id}`}
                        type="button"
                        title={item.label}
                        onClick={() => setEmojiCategory(item.id)}
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded text-sm",
                          emojiCategory === item.id
                            ? "bg-[#FE0000]/10 text-[#c30000]"
                            : "hover:bg-gray-100 text-gray-500"
                        )}
                      >
                        {item.icon}
                      </button>
                    ))}
                  </div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {EMOJI_CATEGORY_ITEMS.find((item) => item.id === emojiCategory)?.label ?? "Emojis"}
                  </p>
                  <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto pr-1">
                    {emojiPool.map((emoji) => (
                      <button
                        key={`compose-emoji-item-${emoji}`}
                        type="button"
                        className="h-8 w-8 rounded text-lg hover:bg-gray-100"
                        onClick={() => addEmojiToBody(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                    {emojiPool.length === 0 && (
                      <p className="col-span-8 py-4 text-center text-xs text-gray-400">No emoji found.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={moreMenuRef}>
              <button
                className="rounded p-1.5 hover:bg-gray-100 hover:text-gray-600"
                title="More options"
                onClick={() => {
                  setShowMoreMenu((v) => !v);
                  setShowLinkPopover(false);
                  setShowImagePopover(false);
                  setShowEmojiPicker(false);
                }}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {showMoreMenu && (
                <div className="absolute bottom-9 left-0 z-20 w-56 rounded-lg border bg-white shadow-lg p-1">
                  <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100" onClick={() => { setDefaultFullscreen((v) => !v); setShowMoreMenu(false); }}>
                    <Settings className="h-3.5 w-3.5 text-gray-500" />
                    {defaultFullscreen ? "Exit full screen" : "Default to full screen"}
                  </button>
                  <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100" onClick={() => { togglePlainTextEditor(); setShowMoreMenu(false); }}>
                    <FileText className="h-3.5 w-3.5 text-gray-500" />
                    {plainTextMode ? "Disable plain text mode" : "Plain text mode"}
                  </button>
                  <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100" onClick={() => { printComposeDraft(); setShowMoreMenu(false); }}>
                    <FileText className="h-3.5 w-3.5 text-gray-500" />
                    Print
                  </button>
                  <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100" onClick={() => { setSpellCheckEnabled((v) => !v); setShowMoreMenu(false); }}>
                    <CheckCheck className="h-3.5 w-3.5 text-gray-500" />
                    {spellCheckEnabled ? "Disable spell check" : "Spell check"}
                  </button>
                  <div className="my-1 border-t border-gray-100" />
                  <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100" onClick={() => { setComposeLabel("primary"); setShowMoreMenu(false); }}>
                    <Mail className="h-3.5 w-3.5 text-gray-500" />
                    Label: Primary
                  </button>
                  <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100" onClick={() => { setComposeLabel("social"); setShowMoreMenu(false); }}>
                    <Mail className="h-3.5 w-3.5 text-gray-500" />
                    Label: Social
                  </button>
                  <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100" onClick={() => { setComposeLabel("promotions"); setShowMoreMenu(false); }}>
                    <Mail className="h-3.5 w-3.5 text-gray-500" />
                    Label: Promotions
                  </button>
                  <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100" onClick={() => { insertMeetingBlock(); setShowMoreMenu(false); }}>
                    <Sparkles className="h-3.5 w-3.5 text-gray-500" />
                    Set up a time to meet
                  </button>
                  <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100" onClick={() => { if (plainTextMode) { setBody(""); } else { setRichBodyHtml(""); } setEditorMountKey((prev) => prev + 1); setShowMoreMenu(false); }}>
                    <Trash2 className="h-3.5 w-3.5 text-gray-500" />
                    Clear message body
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100"
                    onClick={() => {
                      appendToBody(selectedMailboxExtras?.signature || "Best regards,\nTeam");
                      setShowMoreMenu(false);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 text-gray-500" />
                    Insert signature
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleSend(true)} disabled={savingDraft || !subject.trim()}>
              {savingDraft ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />}Save Draft
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Discard</Button>
            <div className="relative inline-flex overflow-hidden rounded-full border border-[#FE0000]/20" ref={sendMenuRef}>
              <button
                type="button"
                onClick={() => void handleSend(false)}
                disabled={sending || !subject.trim() || !composeBodyTextPreview}
                className="inline-flex items-center gap-1.5 bg-[#FE0000] px-4 py-2 text-sm font-medium text-white hover:bg-[#cc0000] disabled:opacity-60"
              >
                {sending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending...</> : <><Send className="h-3.5 w-3.5" />Send</>}
              </button>
              <button
                type="button"
                className="bg-[#FE0000] px-2.5 text-white hover:bg-[#cc0000] border-l border-white/20"
                title="Send options"
                onClick={() => setShowSendMenu((v) => !v)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {showSendMenu && (
                <div className="absolute bottom-11 left-0 z-20 w-48 rounded-lg border bg-white p-1 shadow-lg">
                  <button
                    type="button"
                    className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100"
                    onClick={async () => {
                      const when = window.prompt("Schedule for (e.g. Mar 14, 10:00 AM)");
                      if (!when) return;
                      appendToBody(`\n[Scheduled send requested for ${when}]`);
                      await handleSend(true);
                      setShowSendMenu(false);
                      toast.success(`Saved as draft for scheduled send at ${when}.`);
                    }}
                  >
                    Schedule send
                  </button>
                </div>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function renderPlainTextBody(body: string) {
  return body.split("\n").map((line, idx) => {
    const tokenRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s\]]+)/gi;
    const normalized = line.replace(/^\[([^\]]+)\]$/, "$1");
    const pieces: React.ReactNode[] = [];
    let cursor = 0;
    let tokenIdx = 0;
    for (const match of normalized.matchAll(tokenRegex)) {
      const full = match[0] ?? "";
      const start = match.index ?? 0;
      if (start > cursor) {
        pieces.push(<span key={`txt-${idx}-${tokenIdx}`}>{normalized.slice(cursor, start)}</span>);
      }
      const imageAlt = match[1];
      const imageUrl = match[2];
      const linkLabel = match[3];
      const linkUrl = match[4];
      const bareUrl = match[5];
      if (imageUrl) {
        pieces.push(
          <span key={`img-${idx}-${tokenIdx}`} className="my-2 inline-flex flex-col gap-1">
            <img
              src={imageUrl}
              alt={imageAlt || "Email image"}
              className="max-h-60 max-w-full rounded border border-gray-200 object-contain"
            />
            <a href={imageUrl} target="_blank" rel="noreferrer" className="text-xs text-[#c30000] hover:underline">
              {imageAlt || imageUrl}
            </a>
          </span>
        );
      } else if (linkUrl || bareUrl) {
        const href = linkUrl || bareUrl || "";
        const label = linkLabel || bareUrl || href;
        pieces.push(
          <a key={`lnk-${idx}-${tokenIdx}`} href={href} target="_blank" rel="noreferrer" className="text-[#c30000] hover:underline break-all">
            {label}
          </a>
        );
      } else {
        pieces.push(<span key={`raw-${idx}-${tokenIdx}`}>{full}</span>);
      }
      cursor = start + full.length;
      tokenIdx++;
    }
    if (cursor < normalized.length) {
      pieces.push(<span key={`txt-end-${idx}`}>{normalized.slice(cursor)}</span>);
    }

    if (pieces.length === 0) {
      pieces.push(<span key={`empty-${idx}`}>&nbsp;</span>);
    }

    return (
      <p key={`${idx}-${line.slice(0, 10)}`} className="text-sm leading-relaxed text-gray-700">
        {pieces}
      </p>
    );
  });
}

function EmailDetail({ email, allEmails, canWrite, users, onUpdate, onDelete, mailboxes }: {
  email: EmailItem; allEmails: EmailItem[]; canWrite: boolean;
  users: TeamUser[]; onUpdate: (e: EmailItem) => void; onDelete: (id: string) => void; mailboxes: Mailbox[];
}) {
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<ComposeAttachment[]>([]);
  const [showReplyLink, setShowReplyLink] = useState(false);
  const [showReplyImage, setShowReplyImage] = useState(false);
  const [replyLinkText, setReplyLinkText] = useState("");
  const [replyLinkUrl, setReplyLinkUrl] = useState("");
  const [replyImageAlt, setReplyImageAlt] = useState("");
  const [replyImageUrl, setReplyImageUrl] = useState("");
  const [showReplyEmoji, setShowReplyEmoji] = useState(false);
  const [replyEmojiSearch, setReplyEmojiSearch] = useState("");
  const [replyEmojiCategory, setReplyEmojiCategory] = useState<EmojiCategoryId>("recent");
  const [replyRecentEmojis, setReplyRecentEmojis] = useState<string[]>([]);
  const [showReplyMore, setShowReplyMore] = useState(false);
  const replyAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const replyBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [replying, setReplying] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardPrefill, setForwardPrefill] = useState<ComposePrefill>();
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(new Set());
  const [mailboxExtrasMap, setMailboxExtrasMap] = useState<Record<string, MailboxExtras>>({});

  // Reset on email change
  useEffect(() => {
    setShowReply(false);
    setReplyBody("");
    setReplyAttachments([]);
    setShowReplyLink(false);
    setShowReplyImage(false);
    setReplyLinkText("");
    setReplyLinkUrl("");
    setReplyImageAlt("");
    setReplyImageUrl("");
    setShowReplyEmoji(false);
    setReplyEmojiSearch("");
    setReplyEmojiCategory("recent");
    setShowReplyMore(false);
    setSummary(null);
    try {
      const raw = window.localStorage.getItem("zeddash_recent_emojis_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setReplyRecentEmojis(parsed.slice(0, 24));
      } else {
        setReplyRecentEmojis([]);
      }
    } catch {
      setReplyRecentEmojis([]);
    }
    setMailboxExtrasMap(loadMailboxExtrasMap());
  }, [email.id]);

  // Thread: group by threadId
  const thread = useMemo(() => {
    if (!email.threadId) return [email];
    return allEmails
      .filter((e) => e.threadId === email.threadId || e.id === email.threadId)
      .sort((a, b) => new Date(a.sentAt ?? a.createdAt).getTime() - new Date(b.sentAt ?? b.createdAt).getTime());
  }, [email, allEmails]);

  useEffect(() => {
    if (thread.length === 0) {
      setExpandedThreadIds(new Set());
      return;
    }
    setExpandedThreadIds(new Set([thread[thread.length - 1].id]));
  }, [email.id, thread]);

  function toggleThreadMessage(id: string) {
    setExpandedThreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleStar() {
    const next = !email.isStarred;
    onUpdate({ ...email, isStarred: next });
    await fetch(`/api/email/${email.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isStarred: next }) })
      .catch(() => onUpdate({ ...email, isStarred: email.isStarred }));
  }

  async function markUnread() {
    onUpdate({ ...email, isRead: false });
    await fetch(`/api/email/${email.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isRead: false }) })
      .catch(() => onUpdate({ ...email, isRead: true }));
    toast.success("Marked as unread");
  }

  async function moveToTrash() {
    await fetch(`/api/email/${email.id}`, { method: "DELETE" });
    onDelete(email.id);
    toast.success("Moved to trash");
  }

  async function sendReply() {
    if (!replyBody.trim()) { toast.error("Reply cannot be empty"); return; }
    const externalReplyTo = (email.senderEmail ?? "").trim();
    const toUserIds = email.from ? [email.from.id] : [];
    const toEmails = !email.from && externalReplyTo ? [externalReplyTo] : [];
    if (toUserIds.length === 0 && toEmails.length === 0) {
      toast.error("No valid recipient found for this reply.");
      return;
    }
    setReplying(true);
    try {
      const prefix = email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`;
      const res = await fetch("/api/email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: prefix, body: replyBody.trim(),
          toUserIds,
          toEmails,
          attachments: replyAttachments,
          mailboxId: email.mailboxId,
          parentId: email.id,
          threadId: email.threadId ?? email.id,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to send");
      }
      toast.success("Reply sent");
      setShowReply(false); setReplyBody(""); setReplyAttachments([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    }
    finally { setReplying(false); }
  }

  function appendToReply(text: string) {
    setReplyBody((prev) => (prev ? `${prev}${prev.endsWith("\n") ? "" : "\n"}${text}` : text));
  }

  function insertIntoReply(text: string) {
    setReplyBody((prev) => {
      const el = replyBodyRef.current;
      if (!el) {
        return prev ? `${prev}${prev.endsWith("\n") ? "" : "\n"}${text}` : text;
      }
      const start = el.selectionStart ?? prev.length;
      const end = el.selectionEnd ?? prev.length;
      const next = `${prev.slice(0, start)}${text}${prev.slice(end)}`;
      const cursor = start + text.length;
      queueMicrotask(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
      return next;
    });
  }

  function applyReplyLink() {
    if (!isHttpUrl(replyLinkUrl)) {
      toast.error("Enter a valid URL (http or https).");
      return;
    }
    const label = replyLinkText.trim() || replyLinkUrl.trim();
    insertIntoReply(`[${label}](${replyLinkUrl.trim()})`);
    setShowReplyLink(false);
    setReplyLinkText("");
    setReplyLinkUrl("");
  }

  function applyReplyImage() {
    if (!isHttpUrl(replyImageUrl)) {
      toast.error("Enter a valid image URL (http or https).");
      return;
    }
    const alt = replyImageAlt.trim() || "image";
    insertIntoReply(`![${alt}](${replyImageUrl.trim()})`);
    setShowReplyImage(false);
    setReplyImageAlt("");
    setReplyImageUrl("");
  }

  function addReplyEmoji(emoji: string) {
    insertIntoReply(emoji);
    const next = [emoji, ...replyRecentEmojis.filter((e) => e !== emoji)].slice(0, 24);
    setReplyRecentEmojis(next);
    try {
      window.localStorage.setItem("zeddash_recent_emojis_v1", JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }

  async function handleReplyAttachmentFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: ComposeAttachment[] = [];
    for (const file of Array.from(files)) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Failed to read attachment"));
        reader.readAsDataURL(file);
      });
      next.push({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        dataUrl,
      });
    }
    setReplyAttachments((prev) => [...prev, ...next]);
  }

  async function summarize() {
    setSummarizing(true); setSummary(null);
    try {
      const res = await fetch("/api/email/ai/summarize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: email.subject, body: email.body }),
      });
      if (!res.ok) throw new Error();
      setSummary(await res.json() as AiSummary);
    } catch { toast.error("AI summarize unavailable"); }
    finally { setSummarizing(false); }
  }

  function openForward() {
    setForwardPrefill({
      subject: `Fwd: ${email.subject}`,
      body: `\n\n---------- Forwarded message ----------\nFrom: ${email.from ? displayName(email.from) : (email.senderName || email.senderEmail || "Unknown")} <${email.from?.email ?? email.senderEmail ?? ""}>\nDate: ${formatFullDate(email.createdAt)}\nSubject: ${email.subject}\n\n${email.body}`,
      mailboxId: email.mailboxId ?? undefined,
    });
    setForwardOpen(true);
  }

  const senderName = email.from
    ? displayName(email.from)
    : (email.senderName || email.senderEmail || "Unknown");
  const senderAddress = email.from?.email ?? email.senderEmail ?? "";
  const replyTargetLabel = senderAddress ? `${senderName} <${senderAddress}>` : senderName;
  const isThread = thread.length > 1;
  const replyMailboxExtras = email.mailboxId ? mailboxExtrasMap[email.mailboxId] : undefined;
  const replyEmojiPool = useMemo(() => {
    const source = replyEmojiCategory === "recent" ? replyRecentEmojis : EMOJI_LIBRARY[replyEmojiCategory];
    const q = replyEmojiSearch.trim().toLowerCase();
    if (!q) return source;
    return source.filter((emoji) => emoji.toLowerCase().includes(q));
  }, [replyEmojiCategory, replyEmojiSearch, replyRecentEmojis]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 leading-snug">{email.subject}</h2>
            {isThread && <p className="text-xs text-gray-400 mt-0.5">{thread.length} messages in conversation</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => void toggleStar()} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title={email.isStarred ? "Unstar" : "Star"}>
              <Star className={cn("h-4 w-4", email.isStarred ? "fill-yellow-400 text-yellow-400" : "text-gray-400 hover:text-yellow-500")} />
            </button>
            <button onClick={() => void summarize()} disabled={summarizing} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-[#FE0000]/30 hover:text-[#c30000] transition-all disabled:opacity-50">
              {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>Summarize</span>
            </button>
            {canWrite && (
              <>
                <button onClick={() => void markUnread()} className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700" title="Mark unread">
                  <CheckCheck className="h-4 w-4" />
                </button>
                <button onClick={() => void moveToTrash()} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* AI Summary */}
        {summary && (
          <div className="mx-6 mt-4 rounded-xl border border-[#FE0000]/20 bg-[#fff8f8] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#c30000] flex items-center gap-1.5"><Sparkles className="h-4 w-4" />AI Summary</span>
              <div className="flex items-center gap-2">
                {summary.actionRequired && <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">Action Required</Badge>}
                <Badge variant="secondary" className={cn("text-xs", SENTIMENT_CONFIG[summary.sentiment].className)}>{SENTIMENT_CONFIG[summary.sentiment].label}</Badge>
                <button onClick={() => setSummary(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-2">{summary.summary}</p>
            {summary.keyPoints.length > 0 && (
              <ul className="space-y-1">
                {summary.keyPoints.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#FE0000]/50 shrink-0" />
                    {pt}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Thread messages */}
        <div className="px-6 py-4 space-y-3">
          {thread.map((msg) => {
            const msgSender = msg.from
              ? displayName(msg.from)
              : (msg.senderName || msg.senderEmail || "Unknown");
            const color = avatarColor(msgSender);
            const toLine = msg.recipients
              .filter((r) => r.type === "to")
              .map((r) => displayName(r.user))
              .join(", ");
            const ccLine = msg.recipients
              .filter((r) => r.type === "cc")
              .map((r) => displayName(r.user))
              .join(", ");
            const fallbackTo = msg.mailbox?.email ?? "you";
            const hasHtml = /<\/?[a-z][\s\S]*>/i.test(msg.body);
            const isExpanded = expandedThreadIds.has(msg.id);
            const previewText = getEmailPreview(msg.body);
            return (
              <div key={msg.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleThreadMessage(msg.id)}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/50 hover:bg-gray-100/60 transition-colors"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className={cn("text-xs font-medium", color)}>{initials(msgSender)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900">{msgSender}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-400">{formatFullDate(msg.sentAt ?? msg.createdAt)}</span>
                        <ChevronDown className={cn("h-3.5 w-3.5 text-gray-400 transition-transform", isExpanded ? "rotate-180" : "")} />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 truncate">
                      To: {toLine || fallbackTo}
                      {ccLine ? ` - CC: ${ccLine}` : ""}
                    </p>
                    {!isExpanded && <p className="mt-1 text-xs text-gray-500 truncate">{previewText}</p>}
                  </div>
                </button>
                {isExpanded && (
                <div className="px-4 py-4">
                  {hasHtml ? (
                    <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
                      <iframe
                        title={`email-html-${msg.id}`}
                        className="w-full min-h-[520px] border-0 bg-white"
                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                        srcDoc={`<!doctype html><html><head><meta charset="utf-8"/><base target="_blank"/></head><body style="margin:0;padding:16px;font-family:Arial,sans-serif;color:#202124;">${sanitizeEmailHtml(msg.body)}</body></html>`}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">{renderPlainTextBody(msg.body)}</div>
                  )}
                  {(msg.attachments?.length ?? 0) > 0 && (
                    <div className="mt-4 border-t pt-3">
                      <p className="mb-2 text-sm font-medium text-gray-700">
                        {msg.attachments?.length ?? 0} attachment{(msg.attachments?.length ?? 0) > 1 ? "s" : ""}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {(msg.attachments ?? []).map((att) => (
                          <div key={att.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                            <p className="truncate text-sm font-medium text-gray-800">{att.fileName}</p>
                            <p className="text-xs text-gray-500">{formatFileSize(att.fileSize)} - {att.mimeType}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Inline reply box */}
        {canWrite && showReply && (
          <div className="px-6 pb-4">
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8 mt-2 shrink-0">
                <AvatarFallback className={cn("text-xs font-medium", avatarColor(senderName))}>
                  {initials(senderName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 rounded-2xl border border-gray-300 overflow-hidden shadow-sm bg-white">
                <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50/70">
                  <div className="flex items-center gap-2 min-w-0">
                    <Reply className="h-4 w-4 text-gray-500 shrink-0" />
                    <span className="text-sm text-gray-700 truncate">{replyTargetLabel}</span>
                  </div>
                  <button
                    onClick={() => { setShowReply(false); setReplyBody(""); setReplyAttachments([]); }}
                    className="text-gray-400 hover:text-gray-600"
                    title="Close reply"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Textarea
                  ref={replyBodyRef}
                  rows={9}
                  placeholder="Write your reply..."
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  className="border-0 rounded-none focus-visible:ring-0 resize-none min-h-[240px]"
                  autoFocus
                />
                {replyAttachments.length > 0 && (
                  <div className="px-3 pb-2 flex flex-wrap gap-2">
                    {replyAttachments.map((att, idx) => (
                      <span key={`${att.fileName}-${idx}`} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700">
                        <Paperclip className="h-3.5 w-3.5 text-gray-500" />
                        <span className="max-w-[200px] truncate">{att.fileName}</span>
                        <span className="text-gray-400">({formatFileSize(att.fileSize)})</span>
                        <button
                          type="button"
                          className="text-gray-400 hover:text-red-500"
                          onClick={() => setReplyAttachments((prev) => prev.filter((_, i) => i !== idx))}
                          title="Remove attachment"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-t bg-white">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex overflow-hidden rounded-full border border-[#FE0000]/20">
                      <button
                        onClick={() => void sendReply()}
                        disabled={replying || !replyBody.trim()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#FE0000] hover:bg-[#cc0000] disabled:opacity-60"
                      >
                        {replying ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending...</> : <><Send className="h-3.5 w-3.5" />Send</>}
                      </button>
                      <button
                        className="px-2.5 text-white bg-[#FE0000] hover:bg-[#cc0000] border-l border-white/20"
                        title="Send options"
                        type="button"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input
                      ref={replyAttachmentInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void handleReplyAttachmentFiles(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                    <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Attach file" onClick={() => replyAttachmentInputRef.current?.click()}><Paperclip className="h-4 w-4" /></button>
                    <div className="relative">
                      <button
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                        title="Insert link"
                        onClick={() => {
                          setShowReplyLink((v) => !v);
                          setShowReplyImage(false);
                          setShowReplyEmoji(false);
                          setShowReplyMore(false);
                        }}
                      >
                        <Link2 className="h-4 w-4" />
                      </button>
                      {showReplyLink && (
                        <div className="absolute bottom-9 left-0 z-20 w-[340px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                          <Input
                            placeholder="Text"
                            value={replyLinkText}
                            onChange={(e) => setReplyLinkText(e.target.value)}
                            className="mb-2 h-8 text-sm"
                          />
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="Type or paste a link"
                              value={replyLinkUrl}
                              onChange={(e) => setReplyLinkUrl(e.target.value)}
                              className="h-8 text-sm"
                            />
                            <Button type="button" size="sm" style={{ backgroundColor: "#FE0000", color: "#fff" }} onClick={applyReplyLink}>
                              Apply
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <button
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                        title="Insert image"
                        onClick={() => {
                          setShowReplyImage((v) => !v);
                          setShowReplyLink(false);
                          setShowReplyEmoji(false);
                          setShowReplyMore(false);
                        }}
                      >
                        <ImageIcon className="h-4 w-4" />
                      </button>
                      {showReplyImage && (
                        <div className="absolute bottom-9 left-0 z-20 w-[360px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                          <Input
                            placeholder="Image alt text"
                            value={replyImageAlt}
                            onChange={(e) => setReplyImageAlt(e.target.value)}
                            className="mb-2 h-8 text-sm"
                          />
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="https://..."
                              value={replyImageUrl}
                              onChange={(e) => setReplyImageUrl(e.target.value)}
                              className="h-8 text-sm"
                            />
                            <Button type="button" size="sm" style={{ backgroundColor: "#FE0000", color: "#fff" }} onClick={applyReplyImage}>
                              Apply
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <button
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                        title="Insert emoji"
                        onClick={() => {
                          setShowReplyEmoji((v) => !v);
                          setShowReplyLink(false);
                          setShowReplyImage(false);
                          setShowReplyMore(false);
                        }}
                      >
                        <Smile className="h-4 w-4" />
                      </button>
                      {showReplyEmoji && (
                        <div className="absolute bottom-9 left-0 z-20 w-[360px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                          <div className="mb-2">
                            <Input
                              placeholder="Search"
                              value={replyEmojiSearch}
                              onChange={(e) => setReplyEmojiSearch(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="mb-2 flex flex-wrap items-center gap-1">
                            {EMOJI_CATEGORY_ITEMS.map((item) => (
                              <button
                                key={`reply-emoji-${item.id}`}
                                type="button"
                                title={item.label}
                                onClick={() => setReplyEmojiCategory(item.id)}
                                className={cn(
                                  "inline-flex h-7 w-7 items-center justify-center rounded text-sm",
                                  replyEmojiCategory === item.id
                                    ? "bg-[#FE0000]/10 text-[#c30000]"
                                    : "hover:bg-gray-100 text-gray-500"
                                )}
                              >
                                {item.icon}
                              </button>
                            ))}
                          </div>
                          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                            {EMOJI_CATEGORY_ITEMS.find((item) => item.id === replyEmojiCategory)?.label ?? "Emojis"}
                          </p>
                          <div className="grid max-h-52 grid-cols-8 gap-1 overflow-y-auto pr-1">
                            {replyEmojiPool.map((emoji) => (
                              <button
                                key={`reply-emoji-item-${emoji}`}
                                type="button"
                                className="h-8 w-8 rounded text-lg hover:bg-gray-100"
                                onClick={() => addReplyEmoji(emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                            {replyEmojiPool.length === 0 && (
                              <p className="col-span-8 py-3 text-center text-xs text-gray-400">No emoji found.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="More options" onClick={() => { setShowReplyMore((v) => !v); setShowReplyEmoji(false); setShowReplyLink(false); setShowReplyImage(false); }}><MoreVertical className="h-4 w-4" /></button>
                      {showReplyMore && (
                        <div className="absolute bottom-9 left-0 z-20 w-44 rounded-lg border bg-white shadow-lg p-1">
                          <button className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100" onClick={() => { setReplyBody(""); setShowReplyMore(false); }}>
                            Clear reply text
                          </button>
                          <button className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100" onClick={() => { appendToReply(replyMailboxExtras?.signature || "Best regards,\nTeam"); setShowReplyMore(false); }}>
                            Insert signature
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <button
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                      title="Discard draft"
                      onClick={() => { setShowReply(false); setReplyBody(""); setReplyAttachments([]); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {canWrite && !showReply && (
        <div className="border-t px-6 py-3 flex items-center gap-2 shrink-0">
          <Button size="sm" style={{ backgroundColor: "#FE0000", color: "#fff" }} onClick={() => setShowReply(true)}>
            <Reply className="h-3.5 w-3.5 mr-1.5" />Reply
          </Button>
          <Button size="sm" variant="outline" onClick={openForward}>
            <Forward className="h-3.5 w-3.5 mr-1.5" />Forward
          </Button>
        </div>
      )}

      <ComposeDialog open={forwardOpen} onClose={() => setForwardOpen(false)} onSent={() => { setForwardOpen(false); toast.success("Forwarded"); }} onDrafted={() => setForwardOpen(false)} users={users} prefill={forwardPrefill} mailboxes={mailboxes} />
    </div>
  );
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Email List Item ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

function EmailListItem({ email, isSelected, onClick, onStarToggle }: {
  email: EmailItem; isSelected: boolean;
  onClick: () => void; onStarToggle: (e: React.MouseEvent) => void;
}) {
  const senderName = email.from ? displayName(email.from) : (email.senderName || email.senderEmail || "Unknown");
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 px-4 py-3 cursor-pointer border-b transition-colors group",
        isSelected ? "bg-[#FE0000]/5 border-r-2 border-r-[#FE0000]" : "hover:bg-gray-50/80",
        !email.isRead && !isSelected && "bg-blue-50/20"
      )}
    >
      <div className="mt-2 shrink-0"><div className={cn("w-2 h-2 rounded-full", email.isRead ? "bg-transparent" : "bg-[#FE0000]")} /></div>
      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
        <AvatarFallback className={cn("text-xs font-medium", avatarColor(senderName))}>{initials(senderName)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-0.5">
          <span className={cn("text-sm truncate", !email.isRead ? "font-bold text-gray-900" : "font-medium text-gray-700")}>{senderName}</span>
          <span className="text-[11px] text-gray-400 shrink-0 ml-2">{formatDate(email.sentAt ?? email.createdAt)}</span>
        </div>
        <p className={cn("text-xs truncate mb-0.5", !email.isRead ? "font-semibold text-gray-800" : "text-gray-600")}>{email.subject}</p>
        <p className="text-xs text-gray-400 truncate">{getEmailPreview(email.body)}</p>
      </div>
      <button onClick={onStarToggle} className={cn("shrink-0 mt-0.5 p-0.5 transition-opacity", email.isStarred ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
        <Star className={cn("h-3.5 w-3.5", email.isStarred ? "fill-yellow-400 text-yellow-400" : "text-gray-300 hover:text-yellow-400")} />
      </button>
    </div>
  );
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Main Page ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export default function EmailPage() {
  const { can } = usePermissions();
  const canWrite = can("email", "write");

  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusId>("inbox");
  const [inboxCategory, setInboxCategory] = useState<InboxCategoryId>("primary");
  const [mailboxFilter, setMailboxFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [mailboxMgrOpen, setMailboxMgrOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const canManage = can("email", "manage");
  const autoSyncInFlight = useRef(false);
  const cacheHydratedRef = useRef(false);
  const cacheKey = "zeddash_email_cache_v1";

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!cacheHydratedRef.current) {
      cacheHydratedRef.current = true;
      try {
        const raw = window.localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { emails?: EmailItem[]; mailboxes?: Mailbox[] };
          if (Array.isArray(parsed.emails)) setEmails(parsed.emails);
          if (Array.isArray(parsed.mailboxes)) setMailboxes(parsed.mailboxes);
          if (!silent && (Array.isArray(parsed.emails) || Array.isArray(parsed.mailboxes))) {
            setLoading(false);
          }
        }
      } catch {
        // ignore cache parse errors
      }
    }
    try {
      const statusBuckets = ["inbox", "sent", "draft", "spam", "deleted"] as const;
      const emailRequests = statusBuckets.map((status) =>
        fetch(`/api/email?status=${status}&limit=5000`, { cache: "no-store" })
      );
      const [emailResponses, mr] = await Promise.all([
        Promise.all(emailRequests),
        fetch("/api/email/mailboxes", { cache: "no-store" }),
      ]);
      if (!mr.ok || emailResponses.some((r) => !r.ok)) {
        throw new Error("Failed to load email data");
      }
      const bucketPayloads = (await Promise.all(
        emailResponses.map((r) => r.json())
      )) as EmailItem[][];
      const mergedMap = new Map<string, EmailItem>();
      for (const bucket of bucketPayloads) {
        for (const email of Array.isArray(bucket) ? bucket : []) {
          if (!mergedMap.has(email.id)) mergedMap.set(email.id, email);
        }
      }
      const emailsData = Array.from(mergedMap.values()).sort((a, b) => {
        const at = new Date(a.sentAt ?? a.createdAt).getTime();
        const bt = new Date(b.sentAt ?? b.createdAt).getTime();
        return bt - at;
      });
      const mailboxData = (await mr.json()) as Mailbox[];
      setEmails(Array.isArray(emailsData) ? emailsData : []);
      setMailboxes(Array.isArray(mailboxData) ? mailboxData : []);
      try {
        window.localStorage.setItem(
          cacheKey,
          JSON.stringify({
            emails: Array.isArray(emailsData) ? emailsData : [],
            mailboxes: Array.isArray(mailboxData) ? mailboxData : [],
          })
        );
      } catch {
        // ignore cache write errors
      }
    } catch { toast.error("Failed to load emails"); }
    finally { setLoading(false); }
  }, []);

  const syncAllMailboxes = useCallback(async (options?: { showToast?: boolean; force?: boolean }) => {
    const showToast = options?.showToast ?? true;
    const force = options?.force ?? false;
    if (syncing || mailboxes.length === 0) return;
    setSyncing(true);
    let totalImported = 0;
    let totalUpdated = 0;
    let hasError = false;
    try {
      for (const mb of mailboxes.filter((m) => m.isActive)) {
        try {
          let mailboxImported = 0;
          let mailboxUpdated = 0;

          if (force) {
            let hasMore = true;
            let nextCursor: string | null = null;
            let rounds = 0;

            while (hasMore && rounds < 300) {
              const query = nextCursor
                ? `?force=1&cursor=${encodeURIComponent(nextCursor)}`
                : "?force=1";
              const res = await fetch(`/api/email/mailboxes/${mb.id}/sync${query}`, { method: "POST" });
              const data = (await res.json()) as {
                imported?: number;
                updated?: number;
                error?: string;
                hasMore?: boolean;
                nextCursor?: string | null;
              };
              if (!res.ok) {
                hasError = true;
                if (showToast) toast.error(`${mb.name}: ${data.error ?? "Sync failed"}`);
                break;
              }
              mailboxImported += data.imported ?? 0;
              mailboxUpdated += data.updated ?? 0;
              hasMore = Boolean(data.hasMore);
              nextCursor = data.nextCursor ?? null;
              rounds++;
            }
          } else {
            const res = await fetch(`/api/email/mailboxes/${mb.id}/sync`, { method: "POST" });
            const data = (await res.json()) as { imported?: number; updated?: number; error?: string };
            if (!res.ok) {
              hasError = true;
              if (showToast) toast.error(`${mb.name}: ${data.error ?? "Sync failed"}`);
              continue;
            }
            mailboxImported += data.imported ?? 0;
            mailboxUpdated += data.updated ?? 0;
          }

          totalImported += mailboxImported;
          totalUpdated += mailboxUpdated;
        } catch {
          hasError = true;
          if (showToast) toast.error(`${mb.name}: Network error`);
        }
      }
      // Always reload the list
      await load(true);
      if (!hasError && showToast) {
        const changed = totalImported + totalUpdated;
        toast.success(changed > 0
          ? `Synced ${totalImported} new, updated ${totalUpdated} existing`
          : "Inbox is up to date");
      }
    } catch {
      if (showToast) toast.error("Sync failed");
    }
    finally { setSyncing(false); }
  }, [syncing, mailboxes, load]);

  useEffect(() => {
    void load();
    fetch("/api/team/users?limit=200&isActive=true")
      .then((r) => r.json()).then((d: TeamUser[]) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!(canWrite || canManage)) return;
    const hasActiveMailbox = mailboxes.some((m) => m.isActive);
    if (!hasActiveMailbox) return;

    const run = async () => {
      if (document.hidden) return;
      if (syncing || autoSyncInFlight.current) return;
      autoSyncInFlight.current = true;
      try {
        await syncAllMailboxes({ showToast: false, force: false });
      } finally {
        autoSyncInFlight.current = false;
      }
    };

    const id = window.setInterval(() => { void run(); }, 45000);
    return () => window.clearInterval(id);
  }, [mailboxes, canWrite, canManage, syncing, syncAllMailboxes]);

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of emails) {
      m.set(e.status, (m.get(e.status) ?? 0) + 1);
      if (e.isStarred) m.set("starred", (m.get("starred") ?? 0) + 1);
    }
    m.set("all", emails.length);
    return m;
  }, [emails]);

  const unreadCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of emails) {
      if (e.isRead) continue;
      m.set(e.status, (m.get(e.status) ?? 0) + 1);
      m.set("all", (m.get("all") ?? 0) + 1);
      if (e.isStarred) m.set("starred", (m.get("starred") ?? 0) + 1);
    }
    return m;
  }, [emails]);

  const inboxCategoryCounts = useMemo(() => {
    const m = new Map<InboxCategoryId, number>();
    for (const c of INBOX_CATEGORIES) m.set(c.id, 0);
    for (const e of emails) {
      if (e.status !== "inbox") continue;
      if (!(mailboxFilter === "all" || e.mailboxId === mailboxFilter)) continue;
      const category = getInboxCategory(e);
      m.set(category, (m.get(category) ?? 0) + 1);
    }
    return m;
  }, [emails, mailboxFilter]);

  const filteredEmails = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const inboxScoped = emails.filter((e) => {
      if (e.status !== "inbox") return false;
      if (!(mailboxFilter === "all" || e.mailboxId === mailboxFilter)) return false;
      const senderText = e.from ? displayName(e.from) : (e.senderName ?? e.senderEmail ?? "");
      const queryMatch = !q || e.subject.toLowerCase().includes(q) || senderText.toLowerCase().includes(q) || e.body.toLowerCase().includes(q);
      return queryMatch;
    });
    const hasPrimaryInScope = inboxScoped.some((e) => getInboxCategory(e) === "primary");

    return emails.filter((e) => {
      const ms = statusFilter === "all" ? true : statusFilter === "starred" ? e.isStarred : e.status === statusFilter;
      const mm = mailboxFilter === "all" || e.mailboxId === mailboxFilter;
      const mc =
        statusFilter !== "inbox"
          ? true
          : inboxCategory === "primary" && !hasPrimaryInScope
          ? true
          : getInboxCategory(e) === inboxCategory;
      const sender = e.from ? displayName(e.from) : (e.senderName ?? e.senderEmail ?? "");
      const mq = !q || e.subject.toLowerCase().includes(q) || sender.toLowerCase().includes(q) || e.body.toLowerCase().includes(q);
      return ms && mm && mc && mq;
    });
  }, [emails, statusFilter, mailboxFilter, inboxCategory, searchQuery]);

  const selectedEmail = useMemo(() => filteredEmails.find((e) => e.id === selectedEmailId) ?? null, [filteredEmails, selectedEmailId]);

  useEffect(() => {
    if (!selectedEmailId || !filteredEmails.some((e) => e.id === selectedEmailId)) {
      setSelectedEmailId(filteredEmails[0]?.id ?? null);
    }
  }, [filteredEmails, selectedEmailId]);

  function handleSelect(email: EmailItem) {
    setSelectedEmailId(email.id);
    if (!email.isRead) {
      setEmails((p) => p.map((e) => e.id === email.id ? { ...e, isRead: true } : e));
      void fetch(`/api/email/${email.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isRead: true }) });
    }
  }

  function handleStarToggle(ev: React.MouseEvent, email: EmailItem) {
    ev.stopPropagation();
    const next = !email.isStarred;
    setEmails((p) => p.map((e) => e.id === email.id ? { ...e, isStarred: next } : e));
    void fetch(`/api/email/${email.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isStarred: next }) })
      .catch(() => setEmails((p) => p.map((e) => e.id === email.id ? { ...e, isStarred: email.isStarred } : e)));
  }

  function handleUpdate(updated: EmailItem) { setEmails((p) => p.map((e) => e.id === updated.id ? updated : e)); }
  function handleDelete(id: string) {
    setEmails((p) => p.map((e) => e.id === id ? { ...e, status: "deleted" } : e));
    if (selectedEmailId === id) setSelectedEmailId(filteredEmails.find((e) => e.id !== id)?.id ?? null);
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 border-r bg-white flex flex-col shrink-0">
        <div className="p-3 border-b flex items-center gap-2">
          {canWrite && (
            <Button className="flex-1 bg-[#FE0000] hover:bg-[#cc0000] text-white shadow-sm" size="sm" onClick={() => setComposeOpen(true)}>
              <Pencil className="h-4 w-4 mr-1.5" />Compose
            </Button>
          )}
          {canManage && (
            <button
              onClick={() => setMailboxMgrOpen(true)}
              className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-[#FE0000] hover:border-[#FE0000]/30 transition-colors"
              title="Configure mailboxes"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {STATUS_ITEMS.map((item) => {
            const unread = unreadCounts.get(item.id) ?? 0;
            const total = statusCounts.get(item.id) ?? 0;
            const isActive = statusFilter === item.id;
            return (
              <button key={item.id} onClick={() => { setStatusFilter(item.id); setSearchQuery(""); if (item.id === "inbox") setInboxCategory("primary"); }}
                className={cn("w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors", isActive ? "bg-[#FE0000]/10 text-[#FE0000] font-medium" : "text-gray-600 hover:bg-gray-100")}
              >
                <div className="flex items-center gap-2.5">
                  <item.icon className={cn("h-4 w-4 shrink-0", isActive && item.id === "starred" && "fill-yellow-400 text-yellow-400")} />
                  {item.label}
                </div>
                {unread > 0
                  ? <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-bold", isActive ? "bg-[#FE0000] text-white" : "bg-[#FE0000]/15 text-[#FE0000]")}>{unread}</span>
                  : total > 0
                    ? <span className={cn("text-xs px-1.5 py-0.5 rounded-full", isActive ? "bg-[#FE0000]/20 text-[#c30000]" : "bg-gray-100 text-gray-500")}>{total}</span>
                    : null
                }
              </button>
            );
          })}
          <div className="ml-6 mt-1 space-y-0.5 border-l border-gray-200 pl-2">
            {INBOX_CATEGORIES.map((c) => {
              const active = statusFilter === "inbox" && inboxCategory === c.id;
              const count = inboxCategoryCounts.get(c.id) ?? 0;
              return (
                <button
                  key={`sidebar-${c.id}`}
                  onClick={() => { setStatusFilter("inbox"); setInboxCategory(c.id); }}
                  className={cn(
                    "w-full rounded px-2 py-1 text-left text-xs transition-colors",
                    active
                      ? "bg-[#FE0000]/10 font-medium text-[#FE0000]"
                      : "text-gray-500 hover:bg-gray-100"
                  )}
                >
                  <span>{c.label}</span>
                  <span className="ml-1 text-[10px] text-gray-400">({count})</span>
                </button>
              );
            })}
          </div>

          {mailboxes.length > 0 && (
            <>
              <Separator className="my-2" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-1">Mailboxes</p>
              <button onClick={() => setMailboxFilter("all")} className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors", mailboxFilter === "all" ? "bg-[#FE0000]/10 text-[#FE0000] font-medium" : "text-gray-600 hover:bg-gray-100")}>
                <Server className="h-4 w-4" />All Mailboxes
              </button>
              {mailboxes.map((mb) => (
                <button key={mb.id} onClick={() => setMailboxFilter(mb.id)} className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors truncate", mailboxFilter === mb.id ? "bg-[#FE0000]/10 text-[#FE0000] font-medium" : "text-gray-600 hover:bg-gray-100")}>
                  <Server className="h-4 w-4 shrink-0" /><span className="truncate">{mb.name}</span>
                </button>
              ))}
            </>
          )}
        </nav>
      </div>

      {/* Email List */}
      <div className="w-[300px] border-r bg-white flex flex-col shrink-0">
        <div className="px-3 py-2.5 border-b flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input placeholder="Search..." className="pl-7 h-8 text-xs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>}
          </div>
          {(canWrite || canManage) && mailboxes.length > 0 && (
            <button onClick={() => void syncAllMailboxes({ force: true })} disabled={syncing} className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-[#FE0000] hover:border-[#FE0000]/30 disabled:opacity-50 transition-colors" title="Sync IMAP mailboxes">
              <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            </button>
          )}
          <button onClick={() => void load(true)} className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-gray-700 transition-colors" title="Refresh list">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
        {statusFilter === "inbox" && (
          <div className="border-b bg-white px-2 py-1">
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {INBOX_CATEGORIES.map((c) => {
                const isActive = inboxCategory === c.id;
                const count = inboxCategoryCounts.get(c.id) ?? 0;
                return (
                  <button
                    key={c.id}
                    onClick={() => setInboxCategory(c.id)}
                    className={cn(
                      "shrink-0 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                      isActive
                        ? "bg-[#FE0000]/10 font-medium text-[#FE0000]"
                        : "text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    {c.label}
                    <span className="ml-1 text-[10px] text-gray-400">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="px-4 py-1.5 border-b bg-gray-50/50 flex items-center justify-between">
          <span className="text-xs text-gray-400">{filteredEmails.length} {filteredEmails.length === 1 ? "message" : "messages"}</span>
          {(unreadCounts.get(statusFilter) ?? 0) > 0 && <span className="text-xs text-[#FE0000]">{unreadCounts.get(statusFilter)} unread</span>}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-3/4" /></div>
                </div>
              ))}
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Mail className="h-10 w-10 mx-auto mb-3 opacity-25" />
              <p className="text-sm">{searchQuery ? "No results" : "No emails here"}</p>
              {canWrite && !searchQuery && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setComposeOpen(true)}>Compose</Button>
              )}
            </div>
          ) : (
            filteredEmails.map((email) => (
              <EmailListItem key={email.id} email={email} isSelected={selectedEmail?.id === email.id} onClick={() => handleSelect(email)} onStarToggle={(ev) => handleStarToggle(ev, email)} />
            ))
          )}
        </div>
      </div>

      {/* Detail pane */}
      <div className="flex-1 overflow-hidden">
        {selectedEmail ? (
          <EmailDetail email={selectedEmail} allEmails={emails} canWrite={canWrite} users={users} onUpdate={handleUpdate} onDelete={handleDelete} mailboxes={mailboxes} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Mail className="h-14 w-14 mx-auto mb-4 opacity-20" />
              <p className="text-sm font-medium">Select an email to read</p>
              {canWrite && <Button size="sm" variant="outline" className="mt-3" onClick={() => setComposeOpen(true)}><Pencil className="h-3.5 w-3.5 mr-1.5" />Compose</Button>}
            </div>
          </div>
        )}
      </div>

      {canWrite && (
        <ComposeDialog open={composeOpen} onClose={() => setComposeOpen(false)}
          onSent={(email) => { setEmails((p) => [email, ...p]); setSelectedEmailId(email.id); setStatusFilter("sent"); }}
          onDrafted={(email) => setEmails((p) => [email, ...p])}
          users={users}
          prefill={{
            mailboxId:
              mailboxFilter !== "all"
                ? mailboxFilter
                : mailboxes.find((m) => m.isActive)?.id,
          }}
          mailboxes={mailboxes}
        />
      )}

      {canManage && (
        <MailboxManagerDialog
          open={mailboxMgrOpen}
          onClose={() => setMailboxMgrOpen(false)}
          mailboxes={mailboxes}
          onCreated={(mb) => setMailboxes((p) => [...p, mb])}
          onUpdated={(mb) => setMailboxes((p) => p.map((m) => m.id === mb.id ? mb : m))}
          onDeleted={(id) => setMailboxes((p) => p.filter((m) => m.id !== id))}
          onSync={async (imported: number) => {
            await load(true);
            if (imported > 0) {
              setMailboxMgrOpen(false);  // close dialog so user sees the inbox
              setStatusFilter("inbox");  // switch to inbox view
              setMailboxFilter("all");
            }
          }}
        />
      )}
    </div>
  );
}






