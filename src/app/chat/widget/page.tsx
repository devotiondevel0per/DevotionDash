"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Paperclip, SendHorizontal, Smile, X } from "lucide-react";
import { LinkifiedMessage } from "@/components/chat/linkified-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const COMMON_EMOJIS = ["😊","😂","❤️","👍","🙏","😍","🎉","🔥","👋","😭","🤔","😁","🥰","😎","💪","✅","🙌","💯","🤝","😢","😅","🙃","😆","🥲","😉","💬","📎","🌟","🚀","💡"];

const INACTIVITY_WARN_MS = 10 * 60 * 1000;  // 10 minutes
const INACTIVITY_CLOSE_MS = 15 * 60 * 1000; // 15 minutes total

type WidgetConfig = {
  enabled: boolean;
  brandLabel: string;
  logoUrl?: string | null;
  widgetName?: string | null;
  welcomeText: string;
  accentColor: string;
  position: "left" | "right";
  domain?: string | null;
};

type SessionState = {
  dialogId: string;
  sessionToken: string;
};

type WidgetAttachment = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  fileName: string;
  mimeType: string;
  dataUrl: string;
};

type WidgetMessage = {
  id: string;
  senderType: "visitor" | "agent" | "system";
  senderName: string;
  isSystem: boolean;
  createdAt: string;
  payload: {
    text: string;
    attachments: WidgetAttachment[];
  };
};

function storageKey(token: string) {
  return `zeddash_livechat_session_${token}`;
}

function WidgetPageContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => (searchParams.get("token") ?? "").trim(), [searchParams]);
  const siteHost = useMemo(() => (searchParams.get("site") ?? "").trim().toLowerCase(), [searchParams]);
  const hostGrant = useMemo(() => (searchParams.get("grant") ?? "").trim(), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [agentTyping, setAgentTyping] = useState<string[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ name: string; dataUrl: string; type: string; size: number }>>([]);
  const [inactivityCountdown, setInactivityCountdown] = useState<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const dragRef = useRef<{ startX: number; startY: number; origRight: number; origBottom: number } | null>(null);

  const loadMessages = useCallback(async () => {
    if (!session || !token) return;
    try {
      const url = new URL(`/api/public/livechat/session/${session.dialogId}/messages`, window.location.origin);
      url.searchParams.set("token", token);
      url.searchParams.set("sessionToken", session.sessionToken);
      if (siteHost) url.searchParams.set("site", siteHost);
      if (hostGrant) url.searchParams.set("grant", hostGrant);
      url.searchParams.set("limit", "180");
      const response = await fetch(url.toString(), { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as
        | { items?: WidgetMessage[]; error?: string }
        | null;
      if (!response.ok) throw new Error(data?.error || "Failed to load messages");
      setMessages(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    }
  }, [hostGrant, session, siteHost, token]);

  useEffect(() => {
    if (!token) {
      setError("Missing widget token.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const boot = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/public/livechat/config?token=${encodeURIComponent(token)}${siteHost ? `&site=${encodeURIComponent(siteHost)}` : ""}${hostGrant ? `&grant=${encodeURIComponent(hostGrant)}` : ""}`, {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as
          | (WidgetConfig & { error?: string })
          | null;
        if (!response.ok || !data) throw new Error(data?.error || "Widget is unavailable");
        if (cancelled) return;
        setConfig(data);

        const savedRaw = window.localStorage.getItem(storageKey(token));
        if (savedRaw) {
          try {
            const saved = JSON.parse(savedRaw) as SessionState;
            if (saved?.dialogId && saved?.sessionToken) {
              setSession(saved);
            }
          } catch {
            // ignore malformed local storage
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to initialize widget");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [hostGrant, siteHost, token]);

  useEffect(() => {
    if (!session) return;
    void loadMessages();
    const timer = window.setInterval(() => {
      void loadMessages();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [loadMessages, session]);

  useEffect(() => {
    if (!session || !token) return;
    const poll = async () => {
      try {
        const url = new URL(`/api/public/livechat/session/${session.dialogId}/typing`, window.location.origin);
        url.searchParams.set("sessionToken", session.sessionToken);
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { typers: string[] };
        setAgentTyping(data.typers ?? []);
      } catch { /* ignore */ }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => window.clearInterval(timer);
  }, [session, token]);

  useEffect(() => {
    const viewport = messagesRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages]);

  const createSession = useCallback(async () => {
    if (!token) return;
    if (!visitorName.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!visitorEmail.trim()) {
      setError("Please enter your email.");
      return;
    }
    if (!firstMessage.trim()) {
      setError("Please enter your message.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/public/livechat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          siteHost: siteHost || null,
          hostGrant: hostGrant || null,
          visitorName: visitorName.trim() || null,
          visitorEmail: visitorEmail.trim() || null,
          subject: subject.trim() || null,
          firstMessage: firstMessage.trim(),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { dialogId?: string; sessionToken?: string; error?: string }
        | null;
      if (!response.ok || !data?.dialogId || !data?.sessionToken) {
        throw new Error(data?.error || "Failed to start chat");
      }

      const nextSession = { dialogId: data.dialogId, sessionToken: data.sessionToken };
      setSession(nextSession);
      window.localStorage.setItem(storageKey(token), JSON.stringify(nextSession));
      setFirstMessage("");
      setMessageInput("");
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start chat");
    } finally {
      setCreating(false);
    }
  }, [firstMessage, hostGrant, loadMessages, siteHost, subject, token, visitorEmail, visitorName]);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setInactivityCountdown(null);
  }, []);

  const resetSession = useCallback(() => {
    window.localStorage.removeItem(storageKey(token));
    setSession(null);
    setMessages([]);
    setMessageInput("");
    setAttachments([]);
    setInactivityCountdown(null);
    setError("");
    lastActivityRef.current = Date.now();
  }, [token]);

  const sendMessage = useCallback(async () => {
    if (!session || !token || (!messageInput.trim() && attachments.length === 0)) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/public/livechat/session/${session.dialogId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          sessionToken: session.sessionToken,
          siteHost: siteHost || null,
          hostGrant: hostGrant || null,
          content: messageInput.trim(),
          attachments: attachments.map((a, i) => ({ id: `att_${i}`, fileName: a.name, mimeType: a.type, dataUrl: a.dataUrl, kind: a.type.startsWith("image/") ? "image" : "file", sizeBytes: a.size })),
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Failed to send message");
      setMessageInput("");
      setAttachments([]);
      resetActivity();
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }, [attachments, hostGrant, loadMessages, messageInput, resetActivity, session, siteHost, token]);

  // Inactivity timer: warn at 10 min, auto-close at 15 min
  useEffect(() => {
    if (!session) return;
    lastActivityRef.current = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_CLOSE_MS) {
        resetSession();
      } else if (elapsed >= INACTIVITY_WARN_MS) {
        const remaining = Math.ceil((INACTIVITY_CLOSE_MS - elapsed) / 1000);
        setInactivityCountdown(remaining);
      } else {
        setInactivityCountdown(null);
      }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [session, resetSession]);

  const accent = config?.accentColor || "#FE0000";

  function startDrag(e: React.PointerEvent<HTMLElement>) {
    const root = window.parent.document.getElementById("zeddash-livechat-root");
    if (!root) return;
    const style = window.parent.getComputedStyle(root);
    const right = parseFloat(style.right || "22");
    const bottom = parseFloat(style.bottom || "22");
    dragRef.current = { startX: e.clientX, startY: e.clientY, origRight: right, origBottom: bottom };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onDrag(e: React.PointerEvent<HTMLElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    window.parent.postMessage({ type: "zedchat:move", dx, dy, origRight: dragRef.current.origRight, origBottom: dragRef.current.origBottom }, "*");
  }
  function endDrag() { dragRef.current = null; }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-slate-900">
      <header
        className="flex cursor-grab items-center justify-between px-3 py-2 text-white select-none"
        style={{ backgroundColor: accent }}
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="flex items-center gap-2">
          {config?.logoUrl ? (
            <img src={config.logoUrl} alt="logo" className="h-6 w-6 rounded-full object-cover bg-white/20" />
          ) : null}
          <div>
            <p className="text-xs font-semibold leading-tight">{config?.brandLabel || "Live Support"}</p>
            <p className="text-[10px] text-white/80 leading-tight">{session ? "Connected" : "Start a conversation"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!session ? (
            <a
              href={config?.domain ? `https://${config.domain}/login` : "/login"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-6 items-center rounded-full bg-white/20 px-2 text-[10px] font-medium hover:bg-white/30"
            >
              Login
            </a>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (session) resetSession();
              window.parent.postMessage({ type: "zedchat:close" }, "*");
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20 hover:bg-white/30"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading chat...
          </div>
        ) : !session ? (
          <div className="space-y-2.5 p-3">
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {config?.welcomeText || "Hi there! How can we help you today?"}
            </p>
            <input
              required
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
              placeholder="Your name *"
              value={visitorName}
              onChange={(event) => setVisitorName(event.target.value)}
            />
            <input
              required
              type="email"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
              placeholder="Your email *"
              value={visitorEmail}
              onChange={(event) => setVisitorEmail(event.target.value)}
            />
            <input
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
              placeholder="Subject (optional)"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
            <textarea
              required
              className="min-h-[110px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              placeholder="How can we help you? *"
              value={firstMessage}
              onChange={(event) => setFirstMessage(event.target.value)}
            />
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <button
              type="button"
              disabled={creating}
              onClick={() => void createSession()}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: accent }}
            >
              {creating ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                "Start Chat"
              )}
            </button>
          </div>
        ) : (
          <>
            <div ref={messagesRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {/* Inactivity warning */}
              {inactivityCountdown !== null ? (
                <div className="sticky top-0 z-10 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-800 shadow-sm">
                  <p className="font-semibold">You've been inactive for 10 minutes.</p>
                  <p>This conversation will auto-close in <span className="font-bold">{Math.floor(inactivityCountdown / 60)}:{String(inactivityCountdown % 60).padStart(2, "0")}</span>.</p>
                  <button type="button" onClick={resetActivity} className="mt-1 rounded-full bg-amber-200 px-3 py-0.5 text-[11px] font-medium hover:bg-amber-300">
                    I'm still here
                  </button>
                </div>
              ) : null}
              {messages.map((message) => {
                const isVisitor = message.senderType === "visitor";
                const linkClass = isVisitor
                  ? "text-white/95 hover:text-white"
                  : "text-blue-700 hover:text-blue-900";
                const previewClass = isVisitor
                  ? "border-white/30 bg-white/15 text-white hover:bg-white/25"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
                return (
                <div
                  key={message.id}
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
                    message.senderType === "visitor"
                      ? "ml-auto text-white"
                      : message.senderType === "system"
                      ? "mx-auto bg-slate-100 text-slate-600"
                      : "bg-slate-100 text-slate-800"
                  }`}
                  style={
                    message.senderType === "visitor"
                      ? { backgroundColor: accent }
                      : undefined
                  }
                >
                  {message.senderType !== "visitor" ? (
                    <p className="mb-0.5 text-[11px] font-medium opacity-75">{message.senderName}</p>
                  ) : null}
                  {message.payload.text ? (
                    <LinkifiedMessage
                      text={message.payload.text}
                      textClassName="text-xs leading-relaxed"
                      linkClassName={linkClass}
                      previewClassName={previewClass}
                    />
                  ) : null}
                  {message.payload.attachments.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {message.payload.attachments.map((att) => (
                        att.kind === "image" ? (
                          <a key={att.id} href={att.dataUrl} target="_blank" rel="noreferrer" className="block">
                            <img src={att.dataUrl} alt={att.fileName} className="max-h-28 max-w-[160px] rounded-lg object-cover" />
                          </a>
                        ) : (
                          <a key={att.id} href={att.dataUrl} download={att.fileName} className="flex items-center gap-1 rounded-lg bg-white/20 px-2 py-1 text-[11px] hover:underline">
                            📎 {att.fileName}
                          </a>
                        )
                      ))}
                    </div>
                  ) : null}
                </div>
                );
              })}
              {messages.length === 0 ? (
                <p className="text-center text-xs text-slate-500">No messages yet.</p>
              ) : null}
            </div>

            {session ? (
              <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!session) return;
                    const url = new URL(`/api/public/livechat/session/${session.dialogId}/transcript`, window.location.origin);
                    url.searchParams.set("sessionToken", session.sessionToken);
                    const a = document.createElement("a");
                    a.href = url.toString();
                    a.download = "chat_transcript.txt";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  className="text-[10px] text-slate-400 underline hover:text-slate-600"
                >
                  Download transcript
                </button>
                <a
                  href={config?.domain ? `https://${config.domain}` : "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-slate-400 hover:text-slate-600"
                >
                  Powered by {config?.brandLabel || "Live Support"}
                </a>
              </div>
            ) : null}
            <div className="border-t border-slate-200 p-2">
              {agentTyping.length > 0 ? (
                <div className="flex items-center gap-1.5 px-1 pb-1.5 text-xs text-slate-400">
                  <span className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                  </span>
                  <span>{agentTyping.join(", ")} {agentTyping.length === 1 ? "is" : "are"} typing...</span>
                </div>
              ) : null}
              {error ? <p className="pb-1 text-xs text-red-600">{error}</p> : null}
              {/* Attachment preview */}
              {attachments.length > 0 ? (
                <div className="mb-1 flex flex-wrap gap-1">
                  {attachments.map((a, i) => (
                    <div key={i} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                      <span className="max-w-[80px] truncate">{a.name}</span>
                      <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">×</button>
                    </div>
                  ))}
                </div>
              ) : null}
              {/* Emoji picker */}
              {showEmoji ? (
                <div className="mb-1 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-2">
                  {COMMON_EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => { setMessageInput((prev) => prev + emoji); setShowEmoji(false); }} className="rounded p-0.5 text-base hover:bg-slate-100">
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex items-end gap-1">
                <button type="button" onClick={() => setShowEmoji((s) => !s)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <Smile className="h-4 w-4" />
                </button>
                <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <Paperclip className="h-4 w-4" />
                  <input type="file" accept="image/*,.pdf,.doc,.docx,.txt" multiple className="hidden" onChange={(e) => {
                    const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
                    const files = Array.from(e.target.files ?? []);
                    const oversized = files.filter((f) => f.size > MAX_FILE_SIZE);
                    if (oversized.length > 0) {
                      setError(`File too large: ${oversized.map((f) => f.name).join(", ")}. Max 4 MB per file.`);
                    }
                    files.filter((f) => f.size <= MAX_FILE_SIZE).slice(0, 3).forEach((file) => {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setAttachments((prev) => [...prev, { name: file.name, dataUrl: ev.target?.result as string, type: file.type, size: file.size }]);
                      };
                      reader.readAsDataURL(file);
                    });
                    e.target.value = "";
                  }} />
                </label>
                <textarea
                  className="min-h-[42px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder="Type your message..."
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                      return;
                    }
                    if (!session) return;
                    void fetch(`/api/public/livechat/session/${session.dialogId}/typing`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ sessionToken: session.sessionToken, visitorName: visitorName || "Visitor" }),
                    });
                  }}
                />
                <button
                  type="button"
                  disabled={sending || (!messageInput.trim() && attachments.length === 0)}
                  onClick={() => void sendMessage()}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: accent }}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function WidgetPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-white text-sm text-slate-500">
          Loading live chat...
        </div>
      }
    >
      <WidgetPageContent />
    </Suspense>
  );
}
