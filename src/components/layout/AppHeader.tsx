"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  Bell,
  Camera,
  CheckCheck,
  Copy,
  MessageCircle,
  KeyRound,
  Loader2,
  LogOut,
  Pencil,
  Search,
  Settings,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import type { AppBrandingDetail } from "@/components/layout/SystemThemeBootstrap";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BRANDING_UPDATED_EVENT,
  DEFAULT_APP_NAME,
  DEFAULT_APP_TAGLINE,
  RUNTIME_SETTINGS_STORAGE_KEY,
  resolveBranding,
} from "@/lib/branding";

type HeaderNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

type SelfTwoFactorState = {
  enabled: boolean;
  backupCodesRemaining: number;
  updatedAt: string | null;
};
type WorkState = 0 | 1 | 2;

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
}

export function AppHeader() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { can } = usePermissions();
  const user = session?.user;
  const [appName, setAppName] = useState(DEFAULT_APP_NAME);
  const [appTagline, setAppTagline] = useState(DEFAULT_APP_TAGLINE);
  const [appLogoUrl, setAppLogoUrl] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<HeaderNotification[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changePasswordError, setChangePasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [twoFactorOpen, setTwoFactorOpen] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorSaving, setTwoFactorSaving] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState("");
  const [twoFactorState, setTwoFactorState] = useState<SelfTwoFactorState | null>(null);
  const [twoFactorSetup, setTwoFactorSetup] = useState<{
    secret: string;
    otpAuthUri: string;
    backupCodes: string[];
  } | null>(null);
  const [workState, setWorkState] = useState<WorkState>(1);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", surname: "", position: "", photoUrl: "" });
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const canAdministration = can("administration", "read");
  const canChatNotifications = can("chat", "read") || can("livechat", "read");
  const canUpdateStatus = can("chat", "read") || can("livechat", "read") || can("team", "read");
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  // Close all dialogs and dropdowns when navigating to a different page
  useEffect(() => {
    setChangePasswordOpen(false);
    setTwoFactorOpen(false);
    setChatOpen(false);
    setNotificationsOpen(false);
    setStatusOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        const branding = resolveBranding(parsed);
        setAppName(branding.appName);
        setAppTagline(branding.appTagline);
        setAppLogoUrl(branding.logoUrl);
      }
    } catch {
      // no-op
    }

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<AppBrandingDetail>;
      const detail = customEvent.detail;
      if (!detail) return;
      setAppName(detail.appName || DEFAULT_APP_NAME);
      setAppTagline(detail.appTagline || DEFAULT_APP_TAGLINE);
      setAppLogoUrl(detail.logoUrl?.trim() || null);
    };
    window.addEventListener(BRANDING_UPDATED_EVENT, handler);
    return () => {
      window.removeEventListener(BRANDING_UPDATED_EVENT, handler);
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch("/api/account/profile", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { photoUrl?: string | null } | null) => {
        if (d?.photoUrl) setLocalPhotoUrl(d.photoUrl);
      })
      .catch(() => undefined);
  }, [session?.user?.id]);

  const fetchNotifications = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setNotificationsLoading(true);
    setNotificationsError(null);
    try {
      const response = await fetch("/api/notifications?limit=30", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load notifications");
      const payload = (await response.json()) as {
        notifications?: HeaderNotification[];
        unreadCount?: number;
      };
      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
      setUnreadCount(typeof payload.unreadCount === "number" ? payload.unreadCount : 0);
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : "Failed to load notifications");
    } finally {
      if (!opts?.silent) setNotificationsLoading(false);
    }
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    try {
      const response = await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) return;
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // no-op
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) return;
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    void fetchNotifications();
    const intervalId = window.setInterval(() => {
      void fetchNotifications({ silent: true });
    }, 5000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchNotifications, session?.user?.id]);

  const loadWorkStatus = useCallback(async () => {
    if (!session?.user?.id || !canUpdateStatus) return;
    setStatusLoading(true);
    try {
      const response = await fetch("/api/account/status", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { workState?: number };
      if (data.workState === 0 || data.workState === 1 || data.workState === 2) {
        setWorkState(data.workState);
      }
    } catch {
      // no-op
    } finally {
      setStatusLoading(false);
    }
  }, [canUpdateStatus, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || !canUpdateStatus) return;
    void loadWorkStatus();
  }, [canUpdateStatus, loadWorkStatus, session?.user?.id]);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) void fetchNotifications({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (!notificationsOpen && !chatOpen && !statusOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (notificationsRef.current?.contains(target)) return;
      setNotificationsOpen(false);
      setChatOpen(false);
      setStatusOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [chatOpen, notificationsOpen, statusOpen]);

  const notificationTitle = useMemo(() => {
    if (unreadCount === 0) return "No unread notifications";
    if (unreadCount === 1) return "1 unread notification";
    return `${unreadCount} unread notifications`;
  }, [unreadCount]);

  const chatNotifications = useMemo(
    () =>
      notifications.filter((item) => {
        if (item.type === "chat" || item.type === "livechat") return true;
        const link = item.link?.trim() ?? "";
        return link.startsWith("/chat") || link.startsWith("/livechat");
      }),
    [notifications]
  );
  const chatUnreadCount = useMemo(
    () => chatNotifications.filter((item) => !item.isRead).length,
    [chatNotifications]
  );
  const chatTitle = useMemo(() => {
    if (chatUnreadCount === 0) return "No unread chats";
    if (chatUnreadCount === 1) return "1 unread chat";
    return `${chatUnreadCount} unread chats`;
  }, [chatUnreadCount]);
  const workStateLabel = useMemo(() => {
    if (workState === 0) return "Offline";
    if (workState === 2) return "Away";
    return "Online";
  }, [workState]);

  const markAllChatRead = useCallback(async () => {
    const unreadChatIds = chatNotifications.filter((item) => !item.isRead).map((item) => item.id);
    await Promise.all(unreadChatIds.map((id) => markNotificationRead(id)));
  }, [chatNotifications, markNotificationRead]);

  const updateWorkStatus = useCallback(
    async (nextState: WorkState) => {
      if (!canUpdateStatus || statusSaving) return;
      setStatusSaving(true);
      try {
        const response = await fetch("/api/account/status", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workState: nextState }),
        });
        if (!response.ok) throw new Error("Unable to update status");
        setWorkState(nextState);
        toast.success(`Status set to ${nextState === 1 ? "Online" : nextState === 2 ? "Away" : "Offline"}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to update status");
      } finally {
        setStatusSaving(false);
      }
    },
    [canUpdateStatus, statusSaving]
  );

  const loadTwoFactorState = useCallback(async () => {
    setTwoFactorLoading(true);
    setTwoFactorError("");
    try {
      const response = await fetch("/api/account/2fa", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        enabled?: boolean;
        backupCodesRemaining?: number;
        updatedAt?: string | null;
      };
      if (!response.ok) {
        setTwoFactorError(data.error || "Failed to load 2-step settings.");
        return;
      }
      setTwoFactorState({
        enabled: Boolean(data.enabled),
        backupCodesRemaining: Number(data.backupCodesRemaining ?? 0),
        updatedAt: data.updatedAt ?? null,
      });
    } catch {
      setTwoFactorError("Failed to load 2-step settings.");
    } finally {
      setTwoFactorLoading(false);
    }
  }, []);

  const openTwoFactorDialog = useCallback(() => {
    setTwoFactorOpen(true);
    setTwoFactorError("");
    setTwoFactorSetup(null);
    void loadTwoFactorState();
  }, [loadTwoFactorState]);

  const onTwoFactorAction = useCallback(
    async (action: "enable" | "disable") => {
      setTwoFactorSaving(true);
      setTwoFactorError("");
      try {
        const response = await fetch("/api/account/2fa", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          enabled?: boolean;
          backupCodesRemaining?: number;
          updatedAt?: string | null;
          secret?: string;
          otpAuthUri?: string;
          backupCodes?: string[];
        };
        if (!response.ok) {
          setTwoFactorError(data.error || "Failed to update 2-step verification.");
          return;
        }

        setTwoFactorState({
          enabled: Boolean(data.enabled),
          backupCodesRemaining: Number(data.backupCodesRemaining ?? data.backupCodes?.length ?? 0),
          updatedAt: data.updatedAt ?? new Date().toISOString(),
        });

        if (action === "enable") {
          setTwoFactorSetup({
            secret: data.secret ?? "",
            otpAuthUri: data.otpAuthUri ?? "",
            backupCodes: Array.isArray(data.backupCodes) ? data.backupCodes : [],
          });
          toast.success("2-step verification enabled.");
        } else {
          setTwoFactorSetup(null);
          toast.success("2-step verification disabled.");
        }
      } catch {
        setTwoFactorError("Failed to update 2-step verification.");
      } finally {
        setTwoFactorSaving(false);
      }
    },
    []
  );

  const copyTwoFactorValue = useCallback(async (value: string, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}`);
    }
  }, []);

  const openProfile = useCallback(async () => {
    setProfileOpen(true);
    setProfileLoading(true);
    try {
      const res = await fetch("/api/account/profile", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { name?: string; surname?: string; position?: string; photoUrl?: string };
      setProfileForm({
        name: data.name ?? "",
        surname: data.surname ?? "",
        position: data.position ?? "",
        photoUrl: data.photoUrl ?? "",
      });
    } catch { /* ignore */ } finally {
      setProfileLoading(false);
    }
  }, []);

  const saveProfile = useCallback(async () => {
    setProfileSaving(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      if (!res.ok) throw new Error();
      setLocalPhotoUrl(profileForm.photoUrl || null);
      setProfileOpen(false);
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  }, [profileForm]);

  const openChangePasswordDialog = useCallback(() => {
    setChangePasswordError("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setChangePasswordOpen(true);
  }, []);

  const onSubmitChangePassword = useCallback(async () => {
    setChangePasswordError("");

    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setChangePasswordError("All fields are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangePasswordError("New password and confirm password do not match.");
      return;
    }

    try {
      setChangingPassword(true);
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setChangePasswordError(data.error || "Failed to change password.");
        return;
      }
      setChangePasswordOpen(false);
      toast.success("Password changed successfully.");
    } catch {
      setChangePasswordError("Failed to change password.");
    } finally {
      setChangingPassword(false);
    }
  }, [confirmPassword, currentPassword, newPassword]);

  return (
    <>
      <header className="relative flex h-16 items-center gap-4 overflow-visible border-b border-[#6E4C0E] bg-[linear-gradient(115deg,var(--twx-topbar-from,#67470B)_0%,var(--twx-topbar-mid,#8E610C)_35%,var(--twx-topbar-to,#BF8210)_62%,var(--twx-topbar-accent,#AA8038)_100%)] bg-[length:220%_220%] px-4 shadow-[0_12px_28px_-18px_rgba(52,7,9,0.92)] animate-topbar-flow">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_-30%,rgba(255,255,255,0.34),transparent_43%),radial-gradient(circle_at_86%_130%,rgba(255,255,255,0.18),transparent_46%)]" />

      <div className="relative flex w-[220px] shrink-0 items-center gap-3">
        <img
          src={appLogoUrl?.trim() || "/logo.png"}
          alt="logo"
          className="h-9 w-9 rounded-xl object-cover border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
        />
        <div className="min-w-0 leading-tight">
          <span className="app-topbar-title block truncate text-base font-semibold tracking-wide text-white">
            {appName}
          </span>
          <span className="block text-[11px] text-white/70">
            {appTagline}
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="relative flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
          <Input
            placeholder="Search..."
            className="h-10 rounded-xl border-white/25 bg-white/12 pl-9 pr-3 text-sm text-white placeholder:text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-md transition-colors focus-visible:border-white/45 focus-visible:bg-white/16 focus-visible:ring-white/35"
          />
        </div>
      </div>

      <div className="relative ml-auto flex items-center gap-2" ref={notificationsRef}>
        {canChatNotifications ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              title={chatTitle}
              onClick={() => {
                setChatOpen((prev) => !prev);
                setNotificationsOpen(false);
                setStatusOpen(false);
                if (!chatOpen) void fetchNotifications();
              }}
              className="relative h-9 w-9 rounded-xl border border-white/16 bg-white/10 text-white/85 backdrop-blur-sm transition-all duration-200 hover:-translate-y-[1px] hover:border-white/32 hover:bg-white/18 hover:text-white"
            >
              <MessageCircle className="h-4 w-4" />
              {chatUnreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-[#92630D] bg-[#FFF0D3] px-1 text-[10px] font-semibold text-[#865C0D]">
                  {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                </span>
              ) : null}
            </Button>

            {chatOpen ? (
              <div className="absolute right-11 top-11 z-50 w-[360px] overflow-hidden rounded-2xl border border-[#F0E2C9] bg-white shadow-[0_28px_65px_-24px_rgba(77,9,14,0.58)]">
                <div className="flex items-center justify-between border-b border-[#F4EBDA] bg-[linear-gradient(120deg,#FFFDF9,#FFFAF2)] px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-[#78530D]">Chats</p>
                    <p className="text-xs text-[#A3844A]">{chatTitle}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1.5 px-2 text-xs text-[#9F6E13] hover:bg-[#FFF9EE]"
                    onClick={() => void markAllChatRead()}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark read
                  </Button>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  {notificationsLoading ? (
                    <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading chats...
                    </div>
                  ) : null}
                  {!notificationsLoading && notificationsError ? (
                    <div className="px-4 py-6 text-sm text-red-600">{notificationsError}</div>
                  ) : null}
                  {!notificationsLoading && !notificationsError && chatNotifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-500">
                      No chat notifications available.
                    </div>
                  ) : null}
                  {!notificationsLoading && !notificationsError
                    ? chatNotifications.map((item) => (
                        <button
                          key={item.id}
                          className={cn(
                            "w-full border-b border-[#F6EFE3] px-4 py-3 text-left transition-colors hover:bg-[#FFFDF8]",
                            !item.isRead && "bg-[#FFFBF4]"
                          )}
                          onClick={async () => {
                            await markNotificationRead(item.id);
                            setChatOpen(false);
                            setNotificationsOpen(false);
                            router.push(item.link || "/chat");
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className={cn("text-sm", !item.isRead ? "font-semibold text-[#8F6312]" : "font-medium text-slate-700")}>
                              {item.title}
                            </p>
                            <span className="shrink-0 text-[11px] text-slate-400">{formatRelative(item.createdAt)}</span>
                          </div>
                          {item.body ? <p className="mt-1 text-xs text-slate-500">{item.body}</p> : null}
                        </button>
                      ))
                    : null}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          title={notificationTitle}
          onClick={() => {
            setNotificationsOpen((prev) => !prev);
            setChatOpen(false);
            setStatusOpen(false);
            if (!notificationsOpen) void fetchNotifications();
          }}
          className="relative h-9 w-9 rounded-xl border border-white/16 bg-white/10 text-white/85 backdrop-blur-sm transition-all duration-200 hover:-translate-y-[1px] hover:border-white/32 hover:bg-white/18 hover:text-white"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-[#92630D] bg-[#FFF0D3] px-1 text-[10px] font-semibold text-[#865C0D]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>

        {notificationsOpen ? (
          <div className="absolute right-0 top-11 z-50 w-[360px] overflow-hidden rounded-2xl border border-[#F0E2C9] bg-white shadow-[0_28px_65px_-24px_rgba(77,9,14,0.58)]">
            <div className="flex items-center justify-between border-b border-[#F4EBDA] bg-[linear-gradient(120deg,#FFFDF9,#FFFAF2)] px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-[#78530D]">Notifications</p>
                <p className="text-xs text-[#A3844A]">{notificationTitle}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 px-2 text-xs text-[#9F6E13] hover:bg-[#FFF9EE]"
                onClick={() => void markAllNotificationsRead()}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {notificationsLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading notifications...
                </div>
              ) : null}

              {!notificationsLoading && notificationsError ? (
                <div className="px-4 py-6 text-sm text-red-600">{notificationsError}</div>
              ) : null}

              {!notificationsLoading && !notificationsError && notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">No notifications available.</div>
              ) : null}

              {!notificationsLoading && !notificationsError
                ? notifications.map((item) => (
                    <button
                      key={item.id}
                      className={cn(
                        "w-full border-b border-[#F6EFE3] px-4 py-3 text-left transition-colors hover:bg-[#FFFDF8]",
                        !item.isRead && "bg-[#FFFBF4]"
                      )}
                      onClick={async () => {
                        await markNotificationRead(item.id);
                        setNotificationsOpen(false);
                        if (item.link) router.push(item.link);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className={cn("text-sm", !item.isRead ? "font-semibold text-[#8F6312]" : "font-medium text-slate-700")}>
                          {item.title}
                        </p>
                        <span className="shrink-0 text-[11px] text-slate-400">{formatRelative(item.createdAt)}</span>
                      </div>
                      {item.body ? <p className="mt-1 text-xs text-slate-500">{item.body}</p> : null}
                    </button>
                  ))
                : null}
            </div>
          </div>
        ) : null}

        {canUpdateStatus ? (
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              title={`Status: ${workStateLabel}`}
              onClick={() => {
                setStatusOpen((prev) => !prev);
                setNotificationsOpen(false);
                setChatOpen(false);
              }}
              className="relative h-9 w-9 rounded-xl border border-white/16 bg-white/10 text-white/85 backdrop-blur-sm transition-all duration-200 hover:-translate-y-[1px] hover:border-white/32 hover:bg-white/18 hover:text-white"
            >
              <Activity className="h-4 w-4" />
              <span
                className={cn(
                  "absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border border-[#8A6013]",
                  workState === 1 && "bg-emerald-500",
                  workState === 2 && "bg-amber-500",
                  workState === 0 && "bg-slate-500"
                )}
              />
            </Button>
            {statusOpen ? (
              <div className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-xl border border-[#F0E2C9] bg-white shadow-[0_28px_65px_-24px_rgba(77,9,14,0.58)]">
                <div className="border-b border-[#F4EBDA] bg-[linear-gradient(120deg,#FFFDF9,#FFFAF2)] px-3 py-2">
                  <p className="text-sm font-semibold text-[#78530D]">Work Status</p>
                  <p className="text-xs text-[#A3844A]">{statusLoading ? "Loading..." : workStateLabel}</p>
                </div>
                <div className="p-1.5">
                  <button
                    type="button"
                    disabled={statusSaving}
                    onClick={() => {
                      void updateWorkStatus(1);
                      setStatusOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-[#FFFBF4] disabled:opacity-60"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Online
                  </button>
                  <button
                    type="button"
                    disabled={statusSaving}
                    onClick={() => {
                      void updateWorkStatus(2);
                      setStatusOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-[#FFFBF4] disabled:opacity-60"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    Away
                  </button>
                  <button
                    type="button"
                    disabled={statusSaving}
                    onClick={() => {
                      void updateWorkStatus(0);
                      setStatusOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-[#FFFBF4] disabled:opacity-60"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
                    Offline
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="group flex cursor-pointer items-center gap-2 rounded-xl border border-white/16 bg-white/10 px-2.5 py-1.5 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-[1px] hover:border-white/30 hover:bg-white/18">
            <Avatar className="h-8 w-8 ring-1 ring-white/35">
              <AvatarImage src={localPhotoUrl ?? user?.photoUrl ?? undefined} />
              <AvatarFallback className="bg-[linear-gradient(145deg,#FFFDF8,#FFF2DA)] text-xs font-semibold text-[#B37A11]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[140px] truncate text-sm font-medium text-white sm:block">
              {user?.name}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-xl border border-[#F2E3C6] shadow-[0_18px_42px_-24px_rgba(80,12,17,0.55)]">
            {canAdministration ? (
              <DropdownMenuItem onClick={() => router.push("/administration")}>
                <Settings className="h-4 w-4" />
                Administration
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => void openProfile()}>
              <Pencil className="h-4 w-4" />
              Edit Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openChangePasswordDialog}>
              <KeyRound className="h-4 w-4" />
              Change Password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openTwoFactorDialog}>
              <ShieldCheck className="h-4 w-4" />
              2-Step Verification
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </header>

      <Dialog open={changePasswordOpen} onOpenChange={(next) => (!changingPassword ? setChangePasswordOpen(next) : null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Enter current password, then set a new password.</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmitChangePassword();
            }}
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700" htmlFor="currentPassword">
                Current Password
              </label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                disabled={changingPassword}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700" htmlFor="newPassword">
                New Password
              </label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={changingPassword}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700" htmlFor="confirmPassword">
                Confirm New Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={changingPassword}
              />
            </div>

            {changePasswordError ? <p className="text-sm text-red-600">{changePasswordError}</p> : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={changingPassword}
                onClick={() => setChangePasswordOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={changingPassword} className="bg-[#AA8038] text-white hover:bg-[#D98D00]">
                {changingPassword ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={twoFactorOpen}
        onOpenChange={(next) => (!twoFactorSaving ? setTwoFactorOpen(next) : null)}
      >
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>2-Step Verification</DialogTitle>
            <DialogDescription>Enable or disable 2-step verification for your own account.</DialogDescription>
          </DialogHeader>

          {twoFactorLoading ? (
            <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading security settings...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Status: {twoFactorState?.enabled ? "Enabled" : "Disabled"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Backup codes left: {twoFactorState?.backupCodesRemaining ?? 0}
                  </p>
                </div>
                {twoFactorState?.enabled ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Protected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                    <ShieldOff className="h-3.5 w-3.5" />
                    Not protected
                  </span>
                )}
              </div>

              {twoFactorError ? <p className="text-sm text-red-600">{twoFactorError}</p> : null}

              {twoFactorSetup ? (
                <div className="space-y-3 rounded-lg border border-[#F1E6D2] bg-[#FFFDF8] p-3">
                  <p className="text-sm font-medium text-[#8F6312]">Setup details</p>
                  {twoFactorSetup.otpAuthUri ? (
                    <div className="flex flex-col items-center gap-2">
                      <img
                        alt="2-step QR code"
                        className="h-36 w-36 rounded-md border border-slate-200 bg-white p-1"
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(twoFactorSetup.otpAuthUri)}`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void copyTwoFactorValue(twoFactorSetup.otpAuthUri, "OTP URI")}
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Copy OTP URI
                      </Button>
                    </div>
                  ) : null}

                  <div className="rounded-md border bg-white px-3 py-2">
                    <p className="text-xs text-slate-500">Secret key</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="break-all text-sm font-mono text-slate-700">{twoFactorSetup.secret || "Not available"}</p>
                      {twoFactorSetup.secret ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void copyTwoFactorValue(twoFactorSetup.secret, "Secret key")}
                        >
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          Copy
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {twoFactorSetup.backupCodes.length > 0 ? (
                    <div className="rounded-md border bg-white px-3 py-2">
                      <p className="text-xs text-slate-500">Backup codes</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {twoFactorSetup.backupCodes.map((code) => (
                          <code key={code} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            {code}
                          </code>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTwoFactorOpen(false)} disabled={twoFactorSaving}>
              Close
            </Button>
            {twoFactorState?.enabled ? (
              <Button
                type="button"
                variant="destructive"
                disabled={twoFactorSaving || twoFactorLoading}
                onClick={() => void onTwoFactorAction("disable")}
              >
                {twoFactorSaving ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Disable 2-Step"
                )}
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-[#AA8038] text-white hover:bg-[#D98D00]"
                disabled={twoFactorSaving || twoFactorLoading}
                onClick={() => void onTwoFactorAction("enable")}
              >
                {twoFactorSaving ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Enabling...
                  </>
                ) : (
                  "Enable 2-Step"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update your personal information.</DialogDescription>
          </DialogHeader>
          {profileLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (
            <div className="space-y-4">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  {profileForm.photoUrl ? (
                    <img src={profileForm.photoUrl} alt="avatar" className="h-20 w-20 rounded-full object-cover border-2 border-slate-200" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-200 text-2xl font-bold text-slate-500">
                      {(profileForm.name || user?.name || "U")[0]?.toUpperCase()}
                    </div>
                  )}
                  <label htmlFor="profile-photo-upload" className="absolute bottom-0 right-0 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-[#AA8038] text-white shadow-md hover:bg-[#D98D00]">
                    <Camera className="h-3.5 w-3.5" />
                  </label>
                  <input
                    id="profile-photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const fd = new FormData();
                      fd.append("file", file);
                      const res = await fetch("/api/upload", { method: "POST", body: fd });
                      if (!res.ok) return;
                      const { url } = await res.json() as { url: string };
                      setProfileForm((prev) => ({ ...prev, photoUrl: url }));
                    }}
                  />
                </div>
                <p className="text-xs text-slate-500">Click camera icon to change photo</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">First Name</label>
                  <Input value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} placeholder="First name" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Last Name</label>
                  <Input value={profileForm.surname} onChange={(e) => setProfileForm((p) => ({ ...p, surname: e.target.value }))} placeholder="Last name" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Position / Title</label>
                <Input value={profileForm.position} onChange={(e) => setProfileForm((p) => ({ ...p, position: e.target.value }))} placeholder="e.g. Software Engineer" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)}>Cancel</Button>
            <Button className="bg-[#AA8038] text-white hover:bg-[#D98D00]" disabled={profileSaving || profileLoading} onClick={() => void saveProfile()}>
              {profileSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
