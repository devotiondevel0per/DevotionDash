"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  Building2,
  Copy,
  Clock3,
  Headphones,
  Loader2,
  MessagesSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Save,
  SendHorizontal,
  Smile,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  ExternalLink,
  Download,
  Languages,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { FloatingChatPanel } from "@/components/livechat/FloatingChatPanel";
import { LinkifiedMessage } from "@/components/chat/linkified-message";

type LiveChatOverview = {
  totals: {
    openDialogs: number;
    unassignedDialogs: number;
    closedToday: number;
    messagesToday: number;
    activeQueues: number;
    awaitingAgentReplies: number;
    avgFirstResponseMinutes: number;
  };
};

type Agent = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  lastActivity: string | null;
  hasWrite: boolean;
  hasManage: boolean;
  openLoad: number;
};

type QueueGroup = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  openCount: number;
};

type DialogItem = {
  id: string;
  subject: string;
  visitorName: string | null;
  visitorEmail: string | null;
  status: "open" | "closed";
  group: { id: string; name: string } | null;
  organization: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  assignedTo: Array<{ id: string; name: string; isActive: boolean; lastActivity: string | null }>;
  lastMessage: { id: string; text: string; type: string; sender: string; createdAt: string } | null;
};

type DialogDetail = {
  id: string;
  subject: string;
  visitorName: string | null;
  visitorEmail: string | null;
  status: "open" | "closed";
  group: { id: string; name: string } | null;
  organization: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  assignedTo: Array<{ id: string; name: string; isActive: boolean; lastActivity: string | null }>;
  messages: DialogMessage[];
};

type DialogMessage = {
  id: string;
  userId: string;
  user: { id: string; name: string; lastActivity: string | null };
  isSystem: boolean;
  createdAt: string;
  payload: {
    type: "text" | "media" | "system" | "deleted";
    text: string;
    attachments: Array<{
      id: string;
      kind: "image" | "video" | "audio" | "file";
      fileName: string;
      dataUrl: string;
    }>;
  };
};

type DialogMessagesResponse = {
  items: DialogMessage[];
  hasMore: boolean;
};

type DialogListResponse = {
  permissions: {
    canManage: boolean;
    canWrite: boolean;
  };
  items: DialogItem[];
};

type LiveChatSettings = {
  autoAssignEnabled: boolean;
  routingStrategy: "least_loaded" | "round_robin";
  maxOpenPerAgent: number;
  translatorEnabled: boolean;
  translatorSourceLang: string;
  translatorTargetLang: string;
  aiInsightsEnabled: boolean;
  autoCloseEnabled: boolean;
  autoCloseMinutes: number;
};

type LiveChatWidgetSettings = {
  enabled: boolean;
  allowedDomains: string[];
  token: string;
  brandLabel: string;
  welcomeText: string;
  accentColor: string;
  position: "left" | "right";
  loaderUrl?: string;
  widgetUrl?: string;
  embedScript?: string;
};

type LiveChatInsight = {
  summary: string;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  intent: string;
  urgencyScore: number;
  highlights: string[];
  recommendations: string[];
  generatedAt: string;
  fallback: boolean;
  messageCount: number;
  generatedFor: {
    dialogId: string;
    status: "open" | "closed";
  };
};

type AgentStatusValue = "online" | "away" | "offline";

type DepartmentMember = {
  id: string;
  userId: string;
  isLead: boolean;
  user: {
    id: string;
    name: string;
    fullname: string;
    photoUrl: string | null;
    agentStatus: AgentStatusValue;
    lastActivity: string | null;
    isActive: boolean;
  };
};

type Department = {
  id: string;
  name: string;
  description: string | null;
  openDialogCount: number;
  members: DepartmentMember[];
};

type AISuggestion = {
  suggestions: string[];
  confidence: "high" | "medium" | "low";
  intent: string;
  fallback: boolean;
};

type ChatSection = {
  id: string;
  label: string;
  minAction: "read" | "write" | "manage";
  description: string;
};

const chatSections: ChatSection[] = [
  { id: "inbox", label: "Inbox", minAction: "read", description: "Active live conversations and ownership controls." },
  { id: "queue", label: "Queue", minAction: "write", description: "Unassigned and overflow chats waiting for assignment." },
];

function fmtDate(value: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function AgentStatusDot({ status }: { status: string }) {
  const color = status === "online" ? "bg-green-500" : status === "away" ? "bg-amber-400" : "bg-slate-300";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color} shrink-0`} title={status} />;
}

function LiveChatPageContent() {
  const searchParams = useSearchParams();
  const { can, loading, access } = usePermissions();
  const canRead = can("livechat", "read");
  const canWrite = can("livechat", "write");
  const canManage = can("livechat", "manage");
  const canWriteLeads = can("leads", "write");
  const currentUserId = access?.userId ?? "";

  const [activeSection, setActiveSection] = useState("inbox");
  const [statusFilter, setStatusFilter] = useState<"open" | "closed" | "all">("open");
  const [queueFilter, setQueueFilter] = useState<"all" | "unassigned" | "assigned">("all");
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("all");

  const [overview, setOverview] = useState<LiveChatOverview | null>(null);
  const [dialogs, setDialogs] = useState<DialogItem[]>([]);
  const [selectedDialogId, setSelectedDialogId] = useState<string | null>(null);
  const [selectedDialog, setSelectedDialog] = useState<DialogDetail | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [groups, setGroups] = useState<QueueGroup[]>([]);
  const [targetAgentId, setTargetAgentId] = useState("none");
  const [composerText, setComposerText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [composerAttachments, setComposerAttachments] = useState<Array<{ name: string; dataUrl: string; type: string; size: number }>>([]);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [insight, setInsight] = useState<LiveChatInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  const [myAgentStatus, setMyAgentStatus] = useState<AgentStatusValue>("online");
  const [updatingAgentStatus, setUpdatingAgentStatus] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion | null>(null);
  const [loadingAiSuggestions, setLoadingAiSuggestions] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  // Tracks the messageCount we last observed for each dialog — used to compute real unread deltas
  const knownMessageCountsRef = useRef<Record<string, number>>({});
  const initialDialogLoadDone = useRef(false);

  const [floatingPanels, setFloatingPanels] = useState<string[]>([]);
  const openFloatingPanel = (dialogId: string) => {
    setFloatingPanels((prev) => prev.includes(dialogId) ? prev : [...prev.slice(-2), dialogId]);
  };
  const closeFloatingPanel = (dialogId: string) => {
    setFloatingPanels((prev) => prev.filter((id) => id !== dialogId));
  };
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimerRef = useRef<number | null>(null);
  const [translatorOn, setTranslatorOn] = useState(false);
  const [translatorLang, setTranslatorLang] = useState("English");
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});

  const [newDeptName, setNewDeptName] = useState("");
  const [creatingDept, setCreatingDept] = useState(false);

  const [settingsForm, setSettingsForm] = useState<LiveChatSettings>({
    autoAssignEnabled: true,
    routingStrategy: "least_loaded",
    maxOpenPerAgent: 6,
    translatorEnabled: false,
    translatorSourceLang: "auto",
    translatorTargetLang: "en",
    aiInsightsEnabled: true,
    autoCloseEnabled: false,
    autoCloseMinutes: 120,
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [widgetSaving, setWidgetSaving] = useState(false);
  const [widgetTokenRotating, setWidgetTokenRotating] = useState(false);
  const [widgetForm, setWidgetForm] = useState<LiveChatWidgetSettings>({
    enabled: false,
    allowedDomains: ["localhost", "127.0.0.1"],
    token: "",
    brandLabel: "Live Support",
    welcomeText: "Hi there! How can we help you today?",
    accentColor: "#FE0000",
    position: "right",
    loaderUrl: "",
    widgetUrl: "",
    embedScript: "",
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("livechat_sound") !== "off";
  });
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  function playNotificationBeep() {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {
      // Web Audio not supported or blocked — ignore
    }
  }

  function toggleSound() {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("livechat_sound", next ? "on" : "off");
      return next;
    });
  }

  const [queueCreate, setQueueCreate] = useState({
    name: "",
    description: "",
    isPublic: false,
  });
  const [queueSaving, setQueueSaving] = useState(false);

  const [loadingState, setLoadingState] = useState({
    overview: false,
    dialogs: false,
    detail: false,
    agents: false,
    groups: false,
    action: false,
  });
  const [errors, setErrors] = useState<{ overview: string | null; dialogs: string | null; detail: string | null }>({
    overview: null,
    dialogs: null,
    detail: null,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    subject: "",
    visitorName: "",
    visitorEmail: "",
    groupId: "none",
    firstMessage: "",
    assignToSelf: true,
  });

  const allowedSections = useMemo(
    () => chatSections.filter((section) => can("livechat", section.minAction)),
    [can]
  );

  const selectedDialogSummary = useMemo(
    () => dialogs.find((dialog) => dialog.id === selectedDialogId) ?? null,
    [dialogs, selectedDialogId]
  );

  const isAssignedToCurrent = Boolean(
    selectedDialogSummary?.assignedTo.some((agent) => agent.id === currentUserId)
  );

  const sortMessages = useCallback((items: DialogMessage[]) => {
    return [...items].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, []);

  const mergeMessages = useCallback(
    (current: DialogMessage[], incoming: DialogMessage[]) => {
      if (current.length === 0) return sortMessages(incoming);
      if (incoming.length === 0) return sortMessages(current);
      const map = new Map<string, DialogMessage>();
      for (const message of current) {
        map.set(message.id, message);
      }
      for (const message of incoming) {
        map.set(message.id, message);
      }
      return sortMessages(Array.from(map.values()));
    },
    [sortMessages]
  );

  const loadOverview = useCallback(async (opts?: { silent?: boolean }) => {
    if (!canRead) return;
    const silent = opts?.silent ?? false;
    if (!silent) {
      setLoadingState((prev) => ({ ...prev, overview: true }));
      setErrors((prev) => ({ ...prev, overview: null }));
    }
    try {
      const res = await fetch("/api/livechat/overview", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load live chat overview");
      setOverview((await res.json()) as LiveChatOverview);
    } catch (error) {
      if (!silent) {
        setErrors((prev) => ({
          ...prev,
          overview: error instanceof Error ? error.message : "Failed to load live chat overview",
        }));
      }
    } finally {
      if (!silent) {
        setLoadingState((prev) => ({ ...prev, overview: false }));
      }
    }
  }, [canRead]);

  const loadDialogs = useCallback(async (opts?: { silent?: boolean }) => {
    if (!canRead) return;
    const silent = opts?.silent ?? false;

    if (!silent) {
      setLoadingState((prev) => ({ ...prev, dialogs: true }));
      setErrors((prev) => ({ ...prev, dialogs: null }));
    }

    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      params.set("queue", queueFilter);
      if (search.trim()) params.set("search", search.trim());
      if (groupId !== "all") params.set("groupId", groupId);
      params.set("limit", "150");

      const res = await fetch(`/api/livechat/dialogs?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load dialogs");
      const data = (await res.json()) as DialogListResponse;
      const nextItems = data.items ?? [];
      setDialogs(nextItems);

      // Compute unread counts from actual messageCount deltas (not SSE events)
      const known = knownMessageCountsRef.current;
      if (!initialDialogLoadDone.current) {
        // First load: baseline everything at current count → 0 unread
        initialDialogLoadDone.current = true;
        const init: Record<string, number> = {};
        for (const d of nextItems) init[d.id] = d.messageCount;
        knownMessageCountsRef.current = init;
      } else {
        const newKnown = { ...known };
        const deltas: Record<string, number> = {};
        let hasNew = false;
        for (const d of nextItems) {
          if (!(d.id in known)) {
            // Brand-new dialog appeared — no unread
            newKnown[d.id] = d.messageCount;
          } else if (d.id === selectedDialogId) {
            // Currently selected — always mark seen
            newKnown[d.id] = d.messageCount;
          } else if (d.messageCount > known[d.id]) {
            deltas[d.id] = d.messageCount - known[d.id];
            newKnown[d.id] = d.messageCount;
            hasNew = true;
          }
        }
        knownMessageCountsRef.current = newKnown;
        if (hasNew) {
          setUnreadCounts((prev) => {
            const next = { ...prev };
            for (const [id, delta] of Object.entries(deltas)) {
              next[id] = (next[id] ?? 0) + delta;
            }
            return next;
          });
          if (soundEnabledRef.current) playNotificationBeep();
        }
      }

      if (nextItems.length === 0) {
        setSelectedDialogId(null);
      } else if (!selectedDialogId || !nextItems.some((item) => item.id === selectedDialogId)) {
        setSelectedDialogId(nextItems[0].id);
      }
    } catch (error) {
      if (!silent) {
        setErrors((prev) => ({
          ...prev,
          dialogs: error instanceof Error ? error.message : "Failed to load dialogs",
        }));
      }
    } finally {
      if (!silent) {
        setLoadingState((prev) => ({ ...prev, dialogs: false }));
      }
    }
  }, [canRead, groupId, queueFilter, search, selectedDialogId, statusFilter]);

  const loadDialogDetail = useCallback(async (opts?: { silent?: boolean }) => {
    if (!canRead || !selectedDialogId) {
      setSelectedDialog(null);
      return;
    }
    const silent = opts?.silent ?? false;
    if (!silent) {
      setLoadingState((prev) => ({ ...prev, detail: true }));
      setErrors((prev) => ({ ...prev, detail: null }));
    }
    try {
      const [detailRes, messageRes] = await Promise.all([
        fetch(`/api/livechat/dialogs/${selectedDialogId}`, { cache: "no-store" }),
        fetch(`/api/livechat/dialogs/${selectedDialogId}/messages?limit=100`, {
          cache: "no-store",
        }),
      ]);
      if (!detailRes.ok || !messageRes.ok) {
        throw new Error("Failed to load conversation");
      }

      const detailData = (await detailRes.json()) as Omit<DialogDetail, "messages">;
      const messageData = (await messageRes.json()) as DialogMessagesResponse;
      const incomingMessages = messageData.items ?? [];

      setSelectedDialog((prev) => {
        if (!silent || !prev || prev.id !== detailData.id) {
          return { ...detailData, messages: sortMessages(incomingMessages) };
        }
        return {
          ...detailData,
          messages: mergeMessages(prev.messages, incomingMessages),
        };
      });
      setHasOlderMessages((prev) => (silent ? prev || Boolean(messageData.hasMore) : Boolean(messageData.hasMore)));
    } catch (error) {
      if (!silent) {
        setErrors((prev) => ({
          ...prev,
          detail: error instanceof Error ? error.message : "Failed to load conversation",
        }));
      }
      setSelectedDialog(null);
      setHasOlderMessages(false);
    } finally {
      if (!silent) {
        setLoadingState((prev) => ({ ...prev, detail: false }));
      }
    }
  }, [canRead, selectedDialogId, sortMessages, mergeMessages]);

  const loadAgents = useCallback(async () => {
    if (!canRead) return;
    setLoadingState((prev) => ({ ...prev, agents: true }));
    try {
      const res = await fetch("/api/livechat/agents", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load agents");
      const data = (await res.json()) as { items: Agent[] };
      setAgents(data.items ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load agents");
    } finally {
      setLoadingState((prev) => ({ ...prev, agents: false }));
    }
  }, [canRead]);

  const loadGroups = useCallback(async () => {
    if (!canRead) return;
    setLoadingState((prev) => ({ ...prev, groups: true }));
    try {
      const res = await fetch("/api/livechat/groups", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load groups");
      const data = (await res.json()) as { items: QueueGroup[] };
      setGroups(data.items ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load groups");
    } finally {
      setLoadingState((prev) => ({ ...prev, groups: false }));
    }
  }, [canRead]);

  const loadSettings = useCallback(async () => {
    if (!canManage) return;
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/livechat/settings", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load automation settings");
      const data = (await res.json()) as LiveChatSettings;
      setSettingsForm(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load automation settings");
    } finally {
      setSettingsLoading(false);
    }
  }, [canManage]);

  const loadWidgetSettings = useCallback(async () => {
    if (!canManage) return;
    setWidgetLoading(true);
    try {
      const res = await fetch("/api/livechat/widget", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load widget settings");
      const data = (await res.json()) as LiveChatWidgetSettings;
      setWidgetForm({
        enabled: Boolean(data.enabled),
        allowedDomains: Array.isArray(data.allowedDomains) ? data.allowedDomains : ["localhost"],
        token: data.token || "",
        brandLabel: data.brandLabel || "Live Support",
        welcomeText: data.welcomeText || "Hi there! How can we help you today?",
        accentColor: data.accentColor || "#FE0000",
        position: data.position === "left" ? "left" : "right",
        loaderUrl: data.loaderUrl || "",
        widgetUrl: data.widgetUrl || "",
        embedScript: data.embedScript || "",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load widget settings");
    } finally {
      setWidgetLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    if (!allowedSections.length) return;
    if (!allowedSections.some((section) => section.id === activeSection)) {
      setActiveSection(allowedSections[0].id);
    }
  }, [activeSection, allowedSections]);

  useEffect(() => {
    const dialogFromQuery = searchParams.get("dialog");
    if (dialogFromQuery) setSelectedDialogId(dialogFromQuery);
  }, [searchParams]);

  useEffect(() => {
    if (activeSection === "queue") {
      setQueueFilter((current) => (current === "all" ? "unassigned" : current));
    }
    // Refresh dialogs whenever section switches so inbox/queue stay in sync
    void loadDialogs();
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  useEffect(() => {
    if (!canRead) return;
    void loadOverview();
    void loadDialogs();
    void loadAgents();
    void loadGroups();
    // Fetch current agent status and set online if not already set
    void (async () => {
      try {
        const res = await fetch("/api/livechat/agent-status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { agentStatus?: string }[];
        // The GET returns a list — find current user's entry via /api/permissions
        const permRes = await fetch("/api/permissions", { cache: "no-store" });
        if (!permRes.ok) return;
        const perm = (await permRes.json()) as { userId?: string };
        const me = data.find((a: Record<string, unknown>) => a.id === perm.userId);
        if (me?.agentStatus === "online" || me?.agentStatus === "away" || me?.agentStatus === "offline") {
          setMyAgentStatus(me.agentStatus as AgentStatusValue);
        } else {
          // Default to online when user visits live chat
          await fetch("/api/livechat/agent-status", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "online" }),
          });
          setMyAgentStatus("online");
        }
      } catch { /* ignore */ }
    })();
  }, [canRead, loadAgents, loadDialogs, loadGroups, loadOverview]);

  useEffect(() => {
    if (!canManage) return;
    void loadSettings();
    void loadWidgetSettings();
  }, [canManage, loadSettings, loadWidgetSettings]);

  useEffect(() => {
    if (!canRead) return;

    let disposed = false;
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let refreshTimer: number | null = null;

    const scheduleRefresh = (includeDetail: boolean) => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(() => {
        void loadOverview({ silent: true });
        void loadDialogs({ silent: true });
        if (includeDetail && selectedDialogId) {
          void loadDialogDetail({ silent: true });
        }
      }, 220);
    };

    const connect = () => {
      if (disposed) return;
      source = new EventSource("/api/livechat/stream");
      source.addEventListener("sync", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { dialogId?: string | null };
          const includeDetail = Boolean(
            selectedDialogId && (!payload.dialogId || payload.dialogId === selectedDialogId)
          );
          scheduleRefresh(includeDetail);
        } catch {
          scheduleRefresh(Boolean(selectedDialogId));
        }
      });
      source.addEventListener("error", () => {
        if (source) {
          source.close();
          source = null;
        }
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      });
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (source) source.close();
    };
  }, [canRead, loadDialogDetail, loadDialogs, loadOverview, selectedDialogId]);

  useEffect(() => {
    void loadDialogDetail();
  }, [loadDialogDetail]);

  useEffect(() => {
    setInsight(null);
    setInsightError(null);
    setHasOlderMessages(false);
    setLoadingOlderMessages(false);
    setTranslatedMessages({});
    if (selectedDialogId) {
      setUnreadCounts((prev) => {
        if (!prev[selectedDialogId]) return prev;
        const next = { ...prev };
        delete next[selectedDialogId];
        return next;
      });
      // Sync the baseline so the next loadDialogs refresh doesn't re-count these as unread
      const cur = knownMessageCountsRef.current[selectedDialogId];
      if (cur !== undefined) {
        knownMessageCountsRef.current = { ...knownMessageCountsRef.current, [selectedDialogId]: cur };
      }
    }
  }, [selectedDialogId]);

  useEffect(() => {
    if (!selectedDialog) {
      setTargetAgentId("none");
      return;
    }
    const firstAssignee = selectedDialog.assignedTo[0]?.id;
    setTargetAgentId(firstAssignee ?? "none");
  }, [selectedDialog]);

  useEffect(() => {
    if (!selectedDialogId || !canRead) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/livechat/dialogs/${selectedDialogId}/typing`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { typers: string[] };
        setTypingUsers(data.typers ?? []);
      } catch { /* ignore */ }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => window.clearInterval(timer);
  }, [selectedDialogId, canRead]);

  // Auto-translate incoming visitor messages when translator is on
  useEffect(() => {
    if (!translatorOn || !selectedDialog) return;
    const agentIds = new Set(agents.map((a) => a.id));
    const toTranslate = selectedDialog.messages.filter(
      (msg) => !msg.isSystem && !agentIds.has(msg.userId) && msg.payload.text && !translatedMessages[msg.id]
    );
    if (toTranslate.length === 0) return;
    // Translate up to 5 at a time to avoid hammering the API
    for (const msg of toTranslate.slice(0, 5)) {
      void fetch("/api/livechat/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg.payload.text, targetLang: "English" }),
      }).then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { translated?: string };
        if (data.translated && data.translated !== msg.payload.text) {
          setTranslatedMessages((prev) => ({ ...prev, [msg.id]: data.translated! }));
        }
      }).catch(() => { /* ignore */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translatorOn, selectedDialog?.messages.length, agents]);

  async function updateAgentStatus(status: AgentStatusValue) {
    setUpdatingAgentStatus(true);
    try {
      const res = await fetch("/api/livechat/agent-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setMyAgentStatus(status);
      toast.success(`Status set to ${status}`);
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdatingAgentStatus(false);
    }
  }

  async function loadDepartments() {
    setLoadingDepartments(true);
    try {
      const res = await fetch("/api/livechat/departments");
      if (!res.ok) return;
      const data = await res.json() as Department[];
      setDepartments(data);
    } catch {
      // ignore
    } finally {
      setLoadingDepartments(false);
    }
  }

  async function createDepartment() {
    if (!newDeptName.trim()) return;
    setCreatingDept(true);
    try {
      const res = await fetch("/api/livechat/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDeptName.trim() }),
      });
      if (!res.ok) throw new Error();
      setNewDeptName("");
      await loadDepartments();
      toast.success("Department created");
    } catch {
      toast.error("Failed to create department");
    } finally {
      setCreatingDept(false);
    }
  }

  async function fetchAiSuggestions(dialogId: string, visitorMessage?: string) {
    setLoadingAiSuggestions(true);
    setAiSuggestions(null);
    try {
      const res = await fetch("/api/livechat/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dialogId, message: visitorMessage }),
      });
      const data = (await res.json().catch(() => null)) as (AISuggestion & { error?: string }) | null;
      if (!res.ok || !data) throw new Error(data?.error ?? "AI suggestions unavailable");
      setAiSuggestions(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI suggestions unavailable");
    } finally {
      setLoadingAiSuggestions(false);
    }
  }

  async function runAction(action: () => Promise<void>) {
    setLoadingState((prev) => ({ ...prev, action: true }));
    try {
      await action();
      await Promise.all([loadDialogs(), loadOverview(), loadDialogDetail()]);
    } finally {
      setLoadingState((prev) => ({ ...prev, action: false }));
    }
  }

  async function assignToMe() {
    if (!selectedDialogId || !currentUserId) return;
    await runAction(async () => {
      const res = await fetch(`/api/livechat/dialogs/${selectedDialogId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: currentUserId }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to assign");
      toast.success("Conversation assigned to you");
    });
  }

  async function assignToAgent() {
    if (!selectedDialogId || targetAgentId === "none") return;
    await runAction(async () => {
      const res = await fetch(`/api/livechat/dialogs/${selectedDialogId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: targetAgentId }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to assign");
      toast.success("Conversation assigned");
    });
  }

  async function transferToAgent() {
    if (!selectedDialogId || targetAgentId === "none") return;
    await runAction(async () => {
      const res = await fetch(`/api/livechat/dialogs/${selectedDialogId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: targetAgentId }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to transfer");
      toast.success("Conversation transferred");
    });
  }

  async function toggleStatus() {
    if (!selectedDialogId || !selectedDialog) return;
    const nextStatus = selectedDialog.status === "open" ? "closed" : "open";
    await runAction(async () => {
      const res = await fetch(`/api/livechat/dialogs/${selectedDialogId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to update status");
      toast.success(`Conversation marked as ${nextStatus}`);
    });
  }

  async function createDialog() {
    if (!canWrite) return;
    setLoadingState((prev) => ({ ...prev, action: true }));
    try {
      const res = await fetch("/api/livechat/dialogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: createForm.subject || null,
          visitorName: createForm.visitorName || null,
          visitorEmail: createForm.visitorEmail || null,
          groupId: createForm.groupId !== "none" ? createForm.groupId : null,
          firstMessage: createForm.firstMessage || null,
          assignToSelf: createForm.assignToSelf,
        }),
      });
      const payload = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !payload?.id) throw new Error(payload?.error ?? "Failed to create dialog");
      toast.success("Live chat session created");
      setCreateOpen(false);
      setCreateForm({
        subject: "",
        visitorName: "",
        visitorEmail: "",
        groupId: "none",
        firstMessage: "",
        assignToSelf: true,
      });
      await Promise.all([loadDialogs(), loadOverview()]);
      setSelectedDialogId(payload.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create dialog");
    } finally {
      setLoadingState((prev) => ({ ...prev, action: false }));
    }
  }

  async function sendMessage() {
    if (!canWrite || !selectedDialogId) return;
    const rawText = composerText.trim();
    if (!rawText && composerAttachments.length === 0) return;
    setSendingMessage(true);
    let text = rawText;
    if (translatorOn && translatorLang.trim()) {
      try {
        const tRes = await fetch("/api/livechat/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: rawText, targetLang: translatorLang.trim() }),
        });
        if (tRes.ok) {
          const tData = (await tRes.json()) as { translated?: string };
          if (tData.translated) text = tData.translated;
        }
      } catch { /* send original on error */ }
    }
    try {
      const res = await fetch(`/api/livechat/dialogs/${selectedDialogId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, attachments: composerAttachments.map((a, i) => ({ id: `att_${i}`, fileName: a.name, mimeType: a.type, dataUrl: a.dataUrl, kind: a.type.startsWith("image/") ? "image" : "file", sizeBytes: a.size })) }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to send message");
      setComposerText("");
      setComposerAttachments([]);
      await Promise.all([loadDialogDetail(), loadDialogs(), loadOverview()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setSendingMessage(false);
    }
  }

  async function loadOlderMessages() {
    if (!selectedDialogId || !selectedDialog || loadingOlderMessages || !hasOlderMessages) return;

    const oldest = selectedDialog.messages[0];
    if (!oldest?.createdAt) {
      setHasOlderMessages(false);
      return;
    }

    setLoadingOlderMessages(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      params.set("before", oldest.createdAt);
      const res = await fetch(
        `/api/livechat/dialogs/${selectedDialogId}/messages?${params.toString()}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to load older messages");

      const payload = (await res.json()) as DialogMessagesResponse;
      const incoming = payload.items ?? [];

      setSelectedDialog((prev) => {
        if (!prev || prev.id !== selectedDialogId) return prev;
        return {
          ...prev,
          messages: mergeMessages(prev.messages, incoming),
        };
      });
      setHasOlderMessages(Boolean(payload.hasMore));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load older messages");
    } finally {
      setLoadingOlderMessages(false);
    }
  }

  async function loadInsights() {
    if (!selectedDialogId) return;
    setInsightLoading(true);
    setInsightError(null);
    try {
      const res = await fetch(`/api/livechat/dialogs/${selectedDialogId}/insights`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as (LiveChatInsight & { error?: string }) | null;
      if (!res.ok || !payload) {
        throw new Error(payload?.error ?? "Failed to generate insights");
      }
      setInsight(payload);
      toast.success(payload.fallback ? "Insights generated (fallback mode)" : "Insights generated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate insights";
      setInsightError(message);
      toast.error(message);
    } finally {
      setInsightLoading(false);
    }
  }

  async function convertToLead() {
    if (!selectedDialogId || !canWriteLeads) return;
    await runAction(async () => {
      const res = await fetch(`/api/livechat/dialogs/${selectedDialogId}/convert`, {
        method: "POST",
      });
      const payload = (await res.json().catch(() => null)) as
        | {
            error?: string;
            existing?: boolean;
            message?: string;
            lead?: { id: string; title: string };
          }
        | null;

      if (!res.ok) throw new Error(payload?.error ?? "Failed to convert conversation to lead");

      const leadTitle = payload?.lead?.title ? ` (${payload.lead.title})` : "";
      if (payload?.existing) {
        toast.info(payload.message ?? `Lead already exists${leadTitle}`);
      } else {
        toast.success(payload?.message ?? `Converted to lead${leadTitle}`);
      }
    });
  }

  async function saveAutomationSettings() {
    if (!canManage) return;
    setSettingsSaving(true);
    try {
      const res = await fetch("/api/livechat/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      const payload = (await res.json().catch(() => null)) as (LiveChatSettings & { error?: string }) | null;
      if (!res.ok || !payload) throw new Error(payload?.error ?? "Failed to save settings");
      setSettingsForm(payload);
      toast.success("Automation settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function createQueueGroup() {
    if (!canManage) return;
    const name = queueCreate.name.trim();
    if (!name) {
      toast.error("Queue name is required");
      return;
    }
    setQueueSaving(true);
    try {
      const res = await fetch("/api/livechat/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: queueCreate.description.trim() || null,
          isPublic: queueCreate.isPublic,
        }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to create queue");
      toast.success("Queue created");
      setQueueCreate({ name: "", description: "", isPublic: false });
      await Promise.all([loadGroups(), loadOverview()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create queue");
    } finally {
      setQueueSaving(false);
    }
  }

  async function saveWidgetSettings() {
    if (!canManage) return;
    setWidgetSaving(true);
    try {
      const res = await fetch("/api/livechat/widget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: widgetForm.enabled,
          allowedDomains: widgetForm.allowedDomains,
          brandLabel: widgetForm.brandLabel,
          welcomeText: widgetForm.welcomeText,
          accentColor: widgetForm.accentColor,
          position: widgetForm.position,
        }),
      });
      const payload = (await res.json().catch(() => null)) as (LiveChatWidgetSettings & { error?: string }) | null;
      if (!res.ok || !payload) throw new Error(payload?.error ?? "Failed to save widget settings");
      setWidgetForm({
        enabled: Boolean(payload.enabled),
        allowedDomains: payload.allowedDomains ?? [],
        token: payload.token ?? "",
        brandLabel: payload.brandLabel ?? "Live Support",
        welcomeText: payload.welcomeText ?? "",
        accentColor: payload.accentColor ?? "#FE0000",
        position: payload.position === "left" ? "left" : "right",
        loaderUrl: payload.loaderUrl ?? "",
        widgetUrl: payload.widgetUrl ?? "",
        embedScript: payload.embedScript ?? "",
      });
      toast.success("Widget settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save widget settings");
    } finally {
      setWidgetSaving(false);
    }
  }

  async function rotateWidgetToken() {
    if (!canManage) return;
    setWidgetTokenRotating(true);
    try {
      const res = await fetch("/api/livechat/widget", { method: "POST" });
      const payload = (await res.json().catch(() => null)) as (LiveChatWidgetSettings & { error?: string }) | null;
      if (!res.ok || !payload) throw new Error(payload?.error ?? "Failed to rotate token");
      setWidgetForm({
        enabled: Boolean(payload.enabled),
        allowedDomains: payload.allowedDomains ?? [],
        token: payload.token ?? "",
        brandLabel: payload.brandLabel ?? "Live Support",
        welcomeText: payload.welcomeText ?? "",
        accentColor: payload.accentColor ?? "#FE0000",
        position: payload.position === "left" ? "left" : "right",
        loaderUrl: payload.loaderUrl ?? "",
        widgetUrl: payload.widgetUrl ?? "",
        embedScript: payload.embedScript ?? "",
      });
      toast.success("Widget token rotated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rotate token");
    } finally {
      setWidgetTokenRotating(false);
    }
  }

  async function copyText(value: string, label: string) {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading live chat access...</div>;
  }

  if (!canRead) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Live Chat</CardTitle></CardHeader>
          <CardContent className="text-sm text-slate-600">
            You do not have permission to view this module. Ask your administrator for `livechat.read` access.
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedSection = allowedSections.find((section) => section.id === activeSection) ?? allowedSections[0];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-xl">Live Chat Control Center</CardTitle>
            <div className="flex items-center gap-1">
              {(["online", "away", "offline"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => void updateAgentStatus(s)}
                  disabled={updatingAgentStatus}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                    myAgentStatus === s
                      ? s === "online" ? "border-green-300 bg-green-50 text-green-700 font-medium"
                        : s === "away" ? "border-amber-300 bg-amber-50 text-amber-700 font-medium"
                        : "border-slate-300 bg-slate-100 text-slate-700 font-medium"
                      : "border-transparent text-slate-500 hover:bg-slate-100"
                  )}
                >
                  <AgentStatusDot status={s} />
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
              <button
                onClick={toggleSound}
                title={soundEnabled ? "Sound on — click to mute" : "Sound off — click to enable"}
                className={cn(
                  "ml-1 flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  soundEnabled
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-slate-200 bg-slate-100 text-slate-500"
                )}
              >
                {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                Sound
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            Queue operations, automation policy, and embeddable widget controls are live with strict role-aware controls.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {allowedSections.map((section) => (
              <Button
                key={section.id}
                size="sm"
                variant={section.id === selectedSection.id ? "default" : "outline"}
                className={cn("h-8", section.id === selectedSection.id ? "bg-[#FE0000] text-white hover:bg-[#d90000]" : "")}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </Button>
            ))}
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Open Chats</CardTitle></CardHeader><CardContent className="flex items-center justify-between"><p className="text-2xl font-semibold">{overview?.totals.openDialogs ?? 0}</p><MessagesSquare className="h-5 w-5 text-[#FE0000]" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Unassigned</CardTitle></CardHeader><CardContent className="flex items-center justify-between"><p className="text-2xl font-semibold">{overview?.totals.unassignedDialogs ?? 0}</p><Users className="h-5 w-5 text-[#FE0000]" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Closed Today</CardTitle></CardHeader><CardContent className="flex items-center justify-between"><p className="text-2xl font-semibold">{overview?.totals.closedToday ?? 0}</p><Clock3 className="h-5 w-5 text-[#FE0000]" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Messages Today</CardTitle></CardHeader><CardContent className="flex items-center justify-between"><p className="text-2xl font-semibold">{overview?.totals.messagesToday ?? 0}</p><Activity className="h-5 w-5 text-[#FE0000]" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Active Queues</CardTitle></CardHeader><CardContent className="flex items-center justify-between"><p className="text-2xl font-semibold">{overview?.totals.activeQueues ?? 0}</p><Headphones className="h-5 w-5 text-[#FE0000]" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Awaiting Agent</CardTitle></CardHeader><CardContent className="flex items-center justify-between"><p className="text-2xl font-semibold">{overview?.totals.awaitingAgentReplies ?? 0}</p><MessagesSquare className="h-5 w-5 text-amber-600" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Avg First Reply</CardTitle></CardHeader><CardContent className="flex items-center justify-between"><p className="text-2xl font-semibold">{overview?.totals.avgFirstResponseMinutes ?? 0}<span className="ml-1 text-base font-medium text-slate-500">m</span></p><Clock3 className="h-5 w-5 text-emerald-600" /></CardContent></Card>
      </div>

      {(selectedSection.id === "inbox" || selectedSection.id === "queue") ? (
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="min-h-[560px]">
            <CardHeader className="space-y-3 pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Conversations</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => { void loadDialogs(); void loadOverview(); }}>
                    <RefreshCw className={cn("h-4 w-4", loadingState.dialogs ? "animate-spin" : "")} />
                  </Button>
                  {canWrite ? <Button size="sm" className="h-8 bg-[#FE0000] text-white hover:bg-[#d90000]" onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" />New</Button> : null}
                </div>
              </div>
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search visitor, email, subject..." />
              <div className="grid gap-2 grid-cols-3">
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value === "closed" || value === "all" ? value : "open")}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="closed">Closed</SelectItem><SelectItem value="all">All</SelectItem></SelectContent>
                </Select>
                <Select value={queueFilter} onValueChange={(value) => setQueueFilter(value === "assigned" || value === "unassigned" ? value : "all")}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem><SelectItem value="assigned">Assigned</SelectItem></SelectContent>
                </Select>
                <Select value={groupId} onValueChange={(value) => setGroupId(value || "all")}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All Queues</SelectItem>{groups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {errors.dialogs ? <p className="text-xs text-red-600">{errors.dialogs}</p> : null}
              <div className="max-h-[430px] overflow-y-auto space-y-1.5 pr-1">
                {dialogs.map((dialog) => {
                  const unread = unreadCounts[dialog.id] ?? 0;
                  return (
                    <button
                      type="button"
                      key={dialog.id}
                      onClick={() => setSelectedDialogId(dialog.id)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left transition",
                        selectedDialogId === dialog.id ? "border-[#FE0000] bg-[#FE0000]/5" : unread > 0 ? "border-amber-300 bg-amber-50 hover:bg-amber-100" : "hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">{dialog.subject}</p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {unread > 0 ? <span className="inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-[#FE0000] px-1 text-[10px] font-bold text-white">{unread}</span> : null}
                          <Badge variant={dialog.status === "open" ? "outline" : "secondary"} className="text-[10px] font-normal">{dialog.status}</Badge>
                        </div>
                      </div>
                      <p className="truncate text-xs text-slate-500">{dialog.visitorName || dialog.visitorEmail || "Unknown visitor"}</p>
                      <p className="truncate text-xs text-slate-400">{dialog.assignedTo.length > 0 ? `→ ${dialog.assignedTo.map((agent) => agent.name).join(", ")}` : "Unassigned"}</p>
                    </button>
                  );
                })}
                {dialogs.length === 0 && !loadingState.dialogs ? <p className="rounded-lg border border-dashed p-4 text-xs text-slate-500">No dialogs found for this filter.</p> : null}
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-[560px]">
            <CardHeader className="space-y-1 pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base truncate">{selectedDialog?.subject || "Select a conversation"}</CardTitle>
                {selectedDialog ? (
                  <button
                    type="button"
                    title="Open in separate window"
                    onClick={() => openFloatingPanel(selectedDialog.id)}
                    className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {selectedDialog ? <div className="flex flex-wrap gap-2 text-xs text-slate-600"><span>{selectedDialog.visitorName || selectedDialog.visitorEmail || "Unknown visitor"}</span><span>|</span><span>{selectedDialog.group?.name || "No queue"}</span><span>|</span><span>{selectedDialog.status}</span></div> : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {errors.detail ? <p className="text-xs text-red-600">{errors.detail}</p> : null}
              {selectedDialog ? (
                <>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_220px]">
                      <div className="text-xs text-slate-600 space-y-1">
                        <p>Assigned: {selectedDialog.assignedTo.length > 0 ? selectedDialog.assignedTo.map((row) => row.name).join(", ") : "Unassigned"}</p>
                        <p>Created: {fmtDate(selectedDialog.createdAt)}</p>
                        <p>Updated: {fmtDate(selectedDialog.updatedAt)}</p>
                      </div>
                      <div className="space-y-2">
                        {canWrite ? (
                          <>
                            <Button size="sm" className="w-full bg-[#FE0000] text-white hover:bg-[#d90000]" disabled={loadingState.action} onClick={assignToMe}>Assign To Me</Button>
                            <Select value={targetAgentId} onValueChange={(value) => setTargetAgentId(value || "none")}>
                              <SelectTrigger className="h-8">
                                <SelectValue>
                                  {targetAgentId === "none"
                                    ? "Select agent"
                                    : (agents.find((a) => a.id === targetAgentId)?.name ?? "Select agent")}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Select agent</SelectItem>
                                {agents.filter((agent) => agent.hasWrite).map((agent) => (
                                  <SelectItem key={agent.id} value={agent.id}>
                                    {agent.name} ({agent.openLoad})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="grid grid-cols-2 gap-2">
                              <Button size="sm" variant="outline" disabled={loadingState.action || targetAgentId === "none"} onClick={assignToAgent}>Assign</Button>
                              <Button size="sm" variant="outline" disabled={loadingState.action || targetAgentId === "none" || (!canManage && !isAssignedToCurrent)} onClick={transferToAgent}>Transfer</Button>
                            </div>
                            <Button size="sm" variant="outline" className="w-full" disabled={loadingState.action || (!canManage && !isAssignedToCurrent)} onClick={toggleStatus}>Mark {selectedDialog.status === "open" ? "Closed" : "Open"}</Button>
                          </>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            if (!selectedDialogId) return;
                            const a = document.createElement("a");
                            a.href = `/api/livechat/dialogs/${selectedDialogId}/transcript`;
                            a.download = `transcript_${selectedDialogId}.txt`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          }}
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Download Transcript
                        </Button>
                        <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-2 py-1.5">
                          <Languages className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                          <label className="flex flex-1 cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              checked={translatorOn}
                              onChange={(e) => setTranslatorOn(e.target.checked)}
                              className="h-3 w-3 accent-[#FE0000]"
                            />
                            Auto-translate to{translatorOn ? ":" : "..."}
                          </label>
                          {translatorOn ? (
                            <input
                              className="h-6 w-20 rounded border px-1.5 text-xs"
                              value={translatorLang}
                              onChange={(e) => setTranslatorLang(e.target.value)}
                              placeholder="English"
                            />
                          ) : null}
                        </div>
                        <div className={cn("grid gap-2", canWriteLeads && canWrite ? "grid-cols-2" : "grid-cols-1")}>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={insightLoading}
                            onClick={() => void loadInsights()}
                          >
                            {insightLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "AI Insights"}
                          </Button>
                          {canWriteLeads && canWrite ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={loadingState.action}
                              onClick={() => void convertToLead()}
                            >
                              Convert to Lead
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  {(insight || insightLoading || insightError) ? (
                    <div className="rounded-lg border bg-white p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          AI Insight Summary
                        </p>
                        {insight ? (
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                insight.sentiment === "positive" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                insight.sentiment === "negative" && "border-rose-200 bg-rose-50 text-rose-700",
                                insight.sentiment === "mixed" && "border-amber-200 bg-amber-50 text-amber-700",
                                insight.sentiment === "neutral" && "border-slate-200 bg-slate-50 text-slate-700"
                              )}
                            >
                              {insight.sentiment}
                            </Badge>
                            <Badge variant="secondary" className="bg-[#FE0000]/10 text-[#b10f18]">
                              Urgency {insight.urgencyScore}
                            </Badge>
                          </div>
                        ) : null}
                      </div>

                      {insightLoading ? (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Generating insights...
                        </div>
                      ) : null}

                      {insightError ? <p className="text-xs text-red-600">{insightError}</p> : null}

                      {insight ? (
                        <div className="space-y-2 text-sm text-slate-700">
                          <p>{insight.summary}</p>
                          <p className="text-xs text-slate-500">
                            Intent: {insight.intent} | Messages: {insight.messageCount} | Generated {fmtDate(insight.generatedAt)}
                          </p>
                          {insight.highlights.length > 0 ? (
                            <div>
                              <p className="text-xs font-medium text-slate-600">Highlights</p>
                              <ul className="list-disc pl-5 text-xs text-slate-600">
                                {insight.highlights.map((item, index) => (
                                  <li key={`${item}-${index}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {insight.recommendations.length > 0 ? (
                            <div>
                              <p className="text-xs font-medium text-slate-600">Recommendations</p>
                              <ul className="list-disc pl-5 text-xs text-slate-600">
                                {insight.recommendations.map((item, index) => (
                                  <li key={`${item}-${index}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {(hasOlderMessages || loadingOlderMessages) ? (
                    <div className="flex justify-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        disabled={loadingOlderMessages}
                        onClick={() => void loadOlderMessages()}
                      >
                        {loadingOlderMessages ? (
                          <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            Loading older...
                          </>
                        ) : (
                          "Load older messages"
                        )}
                      </Button>
                    </div>
                  ) : null}

                  <div className="max-h-[420px] overflow-y-auto space-y-1 pr-1">
                    {selectedDialog.messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "rounded-md border px-2.5 py-1.5",
                          message.isSystem ? "bg-slate-50 border-slate-100" : "bg-white border-slate-100"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                          <span className="font-medium text-slate-600">{message.user.name}{message.isSystem ? " · system" : ""}</span>
                          <span className="shrink-0">{fmtDate(message.createdAt)}</span>
                        </div>
                        <LinkifiedMessage
                          text={
                            translatorOn && translatedMessages[message.id]
                              ? translatedMessages[message.id]
                              : message.payload.text || "(no text)"
                          }
                          className="mt-0.5"
                          textClassName="text-sm text-slate-800"
                          linkClassName="text-blue-600 hover:text-blue-800"
                          previewClassName="border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                        />
                        {translatorOn && translatedMessages[message.id] ? (
                          <p className="mt-0.5 text-[10px] text-slate-400 italic">Original: {message.payload.text}</p>
                        ) : null}
                        {message.payload.attachments.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {message.payload.attachments.map((att) => (
                              att.kind === "image" ? (
                                <a key={att.id} href={att.dataUrl} target="_blank" rel="noreferrer" className="block">
                                  <img src={att.dataUrl} alt={att.fileName} className="max-h-32 max-w-[200px] rounded border object-cover" />
                                </a>
                              ) : (
                                <a key={att.id} href={att.dataUrl} download={att.fileName} className="flex items-center gap-1 rounded border bg-slate-50 px-2 py-1 text-xs text-blue-600 hover:underline">
                                  📎 {att.fileName}
                                </a>
                              )
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {selectedDialog.messages.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-xs text-slate-500">No messages yet.</p> : null}
                  </div>

                  {typingUsers.length > 0 ? (
                    <div className="flex items-center gap-1.5 px-1 pb-1 text-xs text-slate-400">
                      <span className="flex gap-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                      </span>
                      <span>{typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...</span>
                    </div>
                  ) : null}
                  {canWrite ? (
                    <div className="rounded-lg border bg-white p-2">
                      <div className="flex items-center gap-1 border-b border-slate-100 pb-1.5">
                        <button type="button" title="Emoji" onClick={() => setShowEmojiPicker((s) => !s)} className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                          <Smile className="h-4 w-4" />
                        </button>
                        <label title="Attach file" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                          <Paperclip className="h-4 w-4" />
                          <input type="file" accept="image/*,.pdf,.doc,.docx,.txt" multiple className="hidden" onChange={(e) => {
                            const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
                            const files = Array.from(e.target.files ?? []);
                            const oversized = files.filter((f) => f.size > MAX_FILE_SIZE);
                            if (oversized.length > 0) {
                              toast.error(`File too large: ${oversized.map((f) => f.name).join(", ")}. Max 4 MB per file.`);
                            }
                            files.filter((f) => f.size <= MAX_FILE_SIZE).slice(0, 5).forEach((file) => {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                setComposerAttachments((prev) => [...prev, { name: file.name, dataUrl: ev.target?.result as string, type: file.type, size: file.size }]);
                              };
                              reader.readAsDataURL(file);
                            });
                            e.target.value = "";
                          }} />
                        </label>
                      </div>
                      {/* Attachment previews */}
                      {composerAttachments.length > 0 ? (
                        <div className="mb-1 flex flex-wrap gap-1">
                          {composerAttachments.map((a, i) => (
                            <div key={i} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                              <span className="max-w-[100px] truncate">{a.name}</span>
                              <button type="button" onClick={() => setComposerAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">×</button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {/* Emoji picker */}
                      {showEmojiPicker ? (
                        <div className="mb-1 flex flex-wrap gap-0.5 rounded-lg border bg-white p-2">
                          {["😊","😂","❤️","👍","🙏","😍","🎉","🔥","👋","😭","🤔","😁","🥰","😎","💪","✅","🙌","💯","🤝","😢","😅","🙃","😆","🥲","😉","💬","📎","🌟","🚀","💡"].map((emoji) => (
                            <button key={emoji} type="button" onClick={() => { setComposerText((p) => p + emoji); setShowEmojiPicker(false); }} className="rounded p-0.5 text-lg hover:bg-slate-100">
                              {emoji}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex items-end gap-2">
                        <Textarea
                          rows={2}
                          value={composerText}
                          onChange={(event) => setComposerText(event.target.value)}
                          placeholder="Reply to visitor..."
                          className="min-h-[64px] resize-y"
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                              event.preventDefault();
                              void sendMessage();
                              return;
                            }
                            // Typing indicator
                            if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
                            void fetch(`/api/livechat/dialogs/${selectedDialogId}/typing`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ name: "Agent" }),
                            });
                            typingTimerRef.current = window.setTimeout(() => {}, 3500);
                          }}
                        />
                        <Button
                          className="h-10 bg-[#FE0000] text-white hover:bg-[#d90000]"
                          disabled={sendingMessage || (!composerText.trim() && composerAttachments.length === 0) || (!canManage && !isAssignedToCurrent)}
                          onClick={() => void sendMessage()}
                        >
                          {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Tip: Ctrl+Enter to send.</p>
                      {/* AI Suggestions */}
                      <div className="border-t mt-2 pt-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (selectedDialog) void fetchAiSuggestions(selectedDialog.id);
                            }}
                            disabled={loadingAiSuggestions || !selectedDialog}
                            className="flex items-center gap-1.5 rounded border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                          >
                            {loadingAiSuggestions ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            AI Suggest
                          </button>
                          {aiSuggestions && (
                            <span className="text-xs text-slate-400">{aiSuggestions.intent} · {aiSuggestions.confidence} confidence</span>
                          )}
                        </div>
                        {aiSuggestions && aiSuggestions.suggestions.length > 0 && (
                          <div className="mt-2 flex flex-col gap-1.5">
                            {aiSuggestions.suggestions.map((suggestion, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  setComposerText(suggestion);
                                  setAiSuggestions(null);
                                }}
                                className="rounded border border-violet-100 bg-violet-50/50 px-3 py-2 text-left text-xs text-slate-700 hover:bg-violet-100 hover:border-violet-200"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-500">Choose a conversation from the left panel.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : selectedSection.id === "departments" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-slate-500" />
              Departments
            </CardTitle>
            <p className="text-sm text-slate-600">Organize agents into departments and monitor their availability.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">All Departments</h2>
                <div className="flex items-center gap-2">
                  <input
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    placeholder="New department name..."
                    className="h-8 rounded border px-2 text-sm"
                  />
                  <Button size="sm" onClick={() => void createDepartment()} disabled={creatingDept || !newDeptName.trim()} className="h-8 bg-[#FE0000] text-white text-xs hover:bg-[#d90000]">
                    {creatingDept ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                  </Button>
                </div>
              </div>
              {loadingDepartments ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              ) : departments.length === 0 ? (
                <p className="text-sm text-slate-500">No departments yet. Create one to organize your agents.</p>
              ) : (
                <div className="space-y-3">
                  {departments.map((dept) => (
                    <div key={dept.id} className="rounded-lg border bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-slate-800">{dept.name}</h3>
                          {dept.description && <p className="text-xs text-slate-500">{dept.description}</p>}
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {dept.openDialogCount} open
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {dept.members.length === 0 ? (
                          <p className="text-xs text-slate-400">No agents assigned</p>
                        ) : (
                          dept.members.map((m) => (
                            <div key={m.id} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                              <AgentStatusDot status={m.user.agentStatus} />
                              {m.user.fullname || m.user.name}
                              {m.isLead && <span className="text-[10px] font-medium text-amber-600">Lead</span>}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : selectedSection.id === "automation" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Automation Policy</CardTitle>
            <p className="text-sm text-slate-600">
              Control routing strategy, load limits, translation, and AI insights for livechat.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {settingsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading settings...
              </div>
            ) : null}

            {!settingsLoading ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-800">Routing</p>
                  <div className="space-y-1.5">
                    <Label>Auto assignment</Label>
                    <Select
                      value={settingsForm.autoAssignEnabled ? "enabled" : "disabled"}
                      onValueChange={(value) =>
                        setSettingsForm((prev) => ({ ...prev, autoAssignEnabled: value === "enabled" }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="enabled">Enabled</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Routing strategy</Label>
                    <Select
                      value={settingsForm.routingStrategy}
                      onValueChange={(value) =>
                        setSettingsForm((prev) => ({
                          ...prev,
                          routingStrategy: value === "round_robin" ? "round_robin" : "least_loaded",
                        }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="least_loaded">Least Loaded</SelectItem>
                        <SelectItem value="round_robin">Round Robin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max open chats per agent</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={settingsForm.maxOpenPerAgent}
                      onChange={(event) =>
                        setSettingsForm((prev) => ({
                          ...prev,
                          maxOpenPerAgent: Math.min(
                            100,
                            Math.max(1, Number.parseInt(event.target.value || "1", 10) || 1)
                          ),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-800">Automation</p>
                  <div className="space-y-1.5">
                    <Label>Translator</Label>
                    <Select
                      value={settingsForm.translatorEnabled ? "enabled" : "disabled"}
                      onValueChange={(value) =>
                        setSettingsForm((prev) => ({ ...prev, translatorEnabled: value === "enabled" }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="enabled">Enabled</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Source language</Label>
                      <Input
                        value={settingsForm.translatorSourceLang}
                        onChange={(event) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            translatorSourceLang: event.target.value.trim().toLowerCase() || "auto",
                          }))
                        }
                        placeholder="auto"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Target language</Label>
                      <Input
                        value={settingsForm.translatorTargetLang}
                        onChange={(event) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            translatorTargetLang: event.target.value.trim().toLowerCase() || "en",
                          }))
                        }
                        placeholder="en"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>AI Insights</Label>
                    <Select
                      value={settingsForm.aiInsightsEnabled ? "enabled" : "disabled"}
                      onValueChange={(value) =>
                        setSettingsForm((prev) => ({ ...prev, aiInsightsEnabled: value === "enabled" }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="enabled">Enabled</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Auto close resolved chats</Label>
                      <Select
                        value={settingsForm.autoCloseEnabled ? "enabled" : "disabled"}
                        onValueChange={(value) =>
                          setSettingsForm((prev) => ({ ...prev, autoCloseEnabled: value === "enabled" }))
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="enabled">Enabled</SelectItem>
                          <SelectItem value="disabled">Disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Auto close in minutes</Label>
                      <Input
                        type="number"
                        min={5}
                        max={1440}
                        value={settingsForm.autoCloseMinutes}
                        onChange={(event) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            autoCloseMinutes: Math.min(
                              1440,
                              Math.max(5, Number.parseInt(event.target.value || "5", 10) || 5)
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button
                className="bg-[#FE0000] text-white hover:bg-[#d90000]"
                disabled={settingsLoading || settingsSaving}
                onClick={() => void saveAutomationSettings()}
              >
                {settingsSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : selectedSection.id === "settings" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Queue Groups</CardTitle>
              <p className="text-sm text-slate-600">Manage queue visibility and monitor open workload.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="max-h-[460px] overflow-y-auto space-y-2 pr-1">
                {groups.map((group) => (
                  <div key={group.id} className="rounded-lg border px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{group.name}</p>
                        <p className="text-xs text-slate-500">
                          {group.description?.trim() || "No description"}
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <Badge variant="outline">{group.isPublic ? "Public" : "Private"}</Badge>
                        <p className="mt-1">{group.openCount} open</p>
                      </div>
                    </div>
                  </div>
                ))}
                {groups.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-xs text-slate-500">
                    No queue groups configured yet.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Queue + Widget Setup</CardTitle>
              <p className="text-sm text-slate-600">Create queues and configure website embed in one place.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Create Queue</p>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={queueCreate.name}
                    onChange={(event) => setQueueCreate((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="VIP Arabic Support"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    rows={2}
                    value={queueCreate.description}
                    onChange={(event) =>
                      setQueueCreate((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder="Handles high-value livechat requests."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Visibility</Label>
                  <Select
                    value={queueCreate.isPublic ? "public" : "private"}
                    onValueChange={(value) =>
                      setQueueCreate((prev) => ({ ...prev, isPublic: value === "public" }))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="public">Public</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full bg-[#FE0000] text-white hover:bg-[#d90000]"
                  disabled={queueSaving}
                  onClick={() => void createQueueGroup()}
                >
                  {queueSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                  Add Queue
                </Button>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Website Widget</p>
                  {widgetLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                </div>

                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={widgetForm.enabled ? "enabled" : "disabled"}
                    onValueChange={(value) =>
                      setWidgetForm((prev) => ({ ...prev, enabled: value === "enabled" }))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enabled">Enabled</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Allowed Domains (one per line)</Label>
                  <Textarea
                    rows={3}
                    value={widgetForm.allowedDomains.join("\n")}
                    onChange={(event) =>
                      setWidgetForm((prev) => ({
                        ...prev,
                        allowedDomains: event.target.value
                          .split(/\n+/g)
                          .map((item) => item.trim().toLowerCase())
                          .filter(Boolean),
                      }))
                    }
                    placeholder={"example.com\n*.example.com\nlocalhost"}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Brand label</Label>
                  <Input
                    value={widgetForm.brandLabel}
                    onChange={(event) => setWidgetForm((prev) => ({ ...prev, brandLabel: event.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Welcome text</Label>
                  <Textarea
                    rows={2}
                    value={widgetForm.welcomeText}
                    onChange={(event) => setWidgetForm((prev) => ({ ...prev, welcomeText: event.target.value }))}
                  />
                </div>

                <div className="grid gap-2 grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Accent color</Label>
                    <Input
                      value={widgetForm.accentColor}
                      onChange={(event) =>
                        setWidgetForm((prev) => ({ ...prev, accentColor: event.target.value.toUpperCase() }))
                      }
                      placeholder="#FE0000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Position</Label>
                    <Select
                      value={widgetForm.position}
                      onValueChange={(value) =>
                        setWidgetForm((prev) => ({ ...prev, position: value === "left" ? "left" : "right" }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="right">Right</SelectItem>
                        <SelectItem value="left">Left</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Widget token</Label>
                  <div className="flex gap-2">
                    <Input value={widgetForm.token} readOnly className="font-mono text-xs" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => void copyText(widgetForm.token, "Token")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void rotateWidgetToken()}
                      disabled={widgetTokenRotating}
                    >
                      {widgetTokenRotating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
                      Rotate
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Embed Script</Label>
                  <Textarea rows={3} value={widgetForm.embedScript || ""} readOnly className="font-mono text-xs" />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => void copyText(widgetForm.embedScript || "", "Embed script")}>
                      <Copy className="mr-1 h-4 w-4" />
                      Copy Script
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void copyText(widgetForm.loaderUrl || "", "Loader URL")}>
                      <Copy className="mr-1 h-4 w-4" />
                      Copy Loader URL
                    </Button>
                  </div>
                </div>

                <Button
                  className="w-full bg-[#FE0000] text-white hover:bg-[#d90000]"
                  disabled={widgetSaving}
                  onClick={() => void saveWidgetSettings()}
                >
                  {widgetSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                  Save Widget
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Floating chat panels */}
      {floatingPanels.length > 0 ? (
        <div className="fixed bottom-0 right-6 z-50 flex items-end gap-3">
          {floatingPanels.map((panelId) => (
            <FloatingChatPanel
              key={panelId}
              dialogId={panelId}
              agents={agents}
              canWrite={canWrite}
              canManage={canManage}
              onClose={() => closeFloatingPanel(panelId)}
            />
          ))}
        </div>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Create Live Chat Session</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label>Subject</Label><Input value={createForm.subject} onChange={(event) => setCreateForm((prev) => ({ ...prev, subject: event.target.value }))} placeholder="Visitor onboarding request" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Visitor Name</Label><Input value={createForm.visitorName} onChange={(event) => setCreateForm((prev) => ({ ...prev, visitorName: event.target.value }))} placeholder="John Visitor" /></div>
              <div className="space-y-1.5"><Label>Visitor Email</Label><Input value={createForm.visitorEmail} onChange={(event) => setCreateForm((prev) => ({ ...prev, visitorEmail: event.target.value }))} placeholder="visitor@example.com" /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Queue Group</Label>
              <Select value={createForm.groupId} onValueChange={(value) => setCreateForm((prev) => ({ ...prev, groupId: value || "none" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">No queue</SelectItem>{groups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Initial ownership</Label>
              <Select
                value={createForm.assignToSelf ? "self" : "auto"}
                onValueChange={(value) => setCreateForm((prev) => ({ ...prev, assignToSelf: value !== "auto" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Assign to me</SelectItem>
                  <SelectItem value="auto">Use auto-routing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Initial Message</Label><Textarea rows={4} value={createForm.firstMessage} onChange={(event) => setCreateForm((prev) => ({ ...prev, firstMessage: event.target.value }))} placeholder="Describe visitor request..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={loadingState.action}>Cancel</Button>
            <Button className="bg-[#FE0000] text-white hover:bg-[#d90000]" onClick={createDialog} disabled={loadingState.action}>{loadingState.action ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Creating...</> : "Create Session"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LiveChatPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading live chat...</div>}>
      <LiveChatPageContent />
    </Suspense>
  );
}
