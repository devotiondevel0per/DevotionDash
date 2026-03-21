"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LinkifiedMessage } from "@/components/chat/linkified-message";
import { toast } from "sonner";

type DialogMessage = {
  id: string;
  userId: string;
  user: { id: string; name: string; lastActivity: string | null };
  isSystem: boolean;
  createdAt: string;
  payload: { type: string; text: string; attachments: Array<{ id: string; kind: string; fileName: string }> };
};

type DialogDetail = {
  id: string;
  subject: string;
  visitorName: string | null;
  visitorEmail: string | null;
  status: "open" | "closed";
  assignedTo: Array<{ id: string; name: string }>;
  messages: DialogMessage[];
};

type AISuggestion = {
  suggestions: string[];
  confidence: string;
  intent: string;
};

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function PopupContent() {
  const searchParams = useSearchParams();
  const dialogId = searchParams.get("dialog") ?? "";
  const [dialog, setDialog] = useState<DialogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadDialog = useCallback(async (silent = false) => {
    if (!dialogId) return;
    if (!silent) setLoading(true);
    try {
      const [detailRes, msgRes] = await Promise.all([
        fetch(`/api/livechat/dialogs/${dialogId}`, { cache: "no-store" }),
        fetch(`/api/livechat/dialogs/${dialogId}/messages?limit=100`, { cache: "no-store" }),
      ]);
      if (!detailRes.ok) throw new Error();
      const detail = (await detailRes.json()) as Omit<DialogDetail, "messages">;
      const msgs = (await msgRes.json()) as { items: DialogMessage[] };
      setDialog({ ...detail, messages: (msgs.items ?? []).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) });
    } catch {
      if (!silent) toast.error("Failed to load conversation");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [dialogId]);

  useEffect(() => { void loadDialog(); }, [loadDialog]);
  useEffect(() => {
    if (!dialogId) return;
    const timer = window.setInterval(() => void loadDialog(true), 4000);
    return () => window.clearInterval(timer);
  }, [loadDialog, dialogId]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dialog?.messages.length]);

  async function sendMessage() {
    if (!dialogId || !composerText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/livechat/dialogs/${dialogId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: composerText.trim() }),
      });
      if (!res.ok) throw new Error();
      setComposerText("");
      await loadDialog(true);
    } catch {
      toast.error("Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function fetchAiSuggestions() {
    if (!dialogId) return;
    setAiLoading(true);
    setAiSuggestions(null);
    try {
      const res = await fetch("/api/livechat/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dialogId }),
      });
      const data = (await res.json()) as AISuggestion & { error?: string };
      if (!res.ok) throw new Error(data.error);
      setAiSuggestions(data);
    } catch {
      toast.error("AI suggestions unavailable");
    } finally {
      setAiLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!dialog) {
    return <div className="flex h-screen items-center justify-center text-sm text-slate-500">Conversation not found.</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-white text-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-[#FE0000] px-3 py-2 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{dialog.subject}</p>
          <p className="text-[11px] text-white/80">
            {dialog.visitorName || dialog.visitorEmail || "Unknown visitor"} · {dialog.status}
          </p>
        </div>
        <div className="shrink-0 text-xs text-white/80">
          {dialog.assignedTo.length > 0 ? `→ ${dialog.assignedTo.map((a) => a.name).join(", ")}` : "Unassigned"}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-1 p-3">
        {dialog.messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "rounded-md border px-2.5 py-1.5",
              msg.isSystem ? "bg-slate-50 border-slate-100" : "bg-white border-slate-100"
            )}
          >
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
              <span className="font-medium text-slate-600">{msg.user.name}{msg.isSystem ? " · system" : ""}</span>
              <span>{fmtTime(msg.createdAt)}</span>
            </div>
            <LinkifiedMessage
              text={msg.payload.text}
              className="mt-0.5"
              textClassName="text-sm text-slate-800"
              linkClassName="text-blue-600 hover:text-blue-800"
              previewClassName="border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
            />
          </div>
        ))}
        {dialog.messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">No messages yet.</p>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      {dialog.status === "open" ? (
        <div className="border-t bg-white p-2 space-y-2">
          {/* AI Suggestions */}
          {aiSuggestions?.suggestions.length ? (
            <div className="space-y-1">
              {aiSuggestions.suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setComposerText(s); setAiSuggestions(null); }}
                  className="w-full rounded border border-violet-100 bg-violet-50 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-100"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder="Reply to visitor... (Ctrl+Enter to send)"
              className="min-h-[52px] flex-1 resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sendMessage(); }
              }}
            />
            <div className="flex flex-col gap-1">
              <Button
                size="sm"
                className="h-8 bg-[#FE0000] text-white hover:bg-[#d90000] px-3"
                disabled={sending || !composerText.trim()}
                onClick={() => void sendMessage()}
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizontal className="h-3.5 w-3.5" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3"
                disabled={aiLoading}
                onClick={() => void fetchAiSuggestions()}
                title="AI Suggest"
              >
                {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t p-3 text-center text-xs text-slate-400">This conversation is closed.</div>
      )}
    </div>
  );
}

export default function LiveChatPopupPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-slate-400">Loading...</div>}>
      <PopupContent />
    </Suspense>
  );
}
