"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

function renderWithLinks(text: string): React.ReactNode {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all opacity-90 hover:opacity-100">
        {part}
      </a>
    ) : part
  );
}
import { Loader2, Minus, Paperclip, SendHorizontal, Smile, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type DialogMessage = {
  id: string;
  userId: string;
  user: { id: string; name: string; lastActivity: string | null };
  isSystem: boolean;
  createdAt: string;
  payload: { type: string; text: string; attachments: Array<{ id: string; kind: string; fileName: string }> };
};

type PanelDialog = {
  id: string;
  subject: string;
  visitorName: string | null;
  visitorEmail: string | null;
  status: "open" | "closed";
  messages: DialogMessage[];
};

type Agent = {
  id: string;
  name: string;
  hasWrite: boolean;
  hasManage: boolean;
  openLoad: number;
};

export function FloatingChatPanel({
  dialogId,
  agents,
  canWrite,
  canManage,
  onClose,
}: {
  dialogId: string;
  agents: Agent[];
  canWrite: boolean;
  canManage: boolean;
  onClose: () => void;
}) {
  const [dialog, setDialog] = useState<PanelDialog | null>(null);
  const [loading, setLoading] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [composerAttachments, setComposerAttachments] = useState<
    Array<{ name: string; dataUrl: string; type: string; size: number }>
  >([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadDialog = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [detailRes, msgRes] = await Promise.all([
        fetch(`/api/livechat/dialogs/${dialogId}`, { cache: "no-store" }),
        fetch(`/api/livechat/dialogs/${dialogId}/messages?limit=50`, { cache: "no-store" }),
      ]);
      if (!detailRes.ok) throw new Error();
      const detail = (await detailRes.json()) as Omit<PanelDialog, "messages">;
      const msgs = (await msgRes.json()) as { items: DialogMessage[] };
      setDialog({
        ...detail,
        messages: (msgs.items ?? []).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
      });
    } catch {
      if (!silent) toast.error("Failed to load");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [dialogId]);

  useEffect(() => {
    void loadDialog();
    const timer = window.setInterval(() => void loadDialog(true), 3500);
    return () => window.clearInterval(timer);
  }, [loadDialog]);

  // Typing poll
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/livechat/dialogs/${dialogId}/typing`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { typers: string[] };
        setTypingUsers(data.typers ?? []);
      } catch { /* ignore */ }
    };
    const timer = window.setInterval(() => void poll(), 1500);
    return () => window.clearInterval(timer);
  }, [dialogId]);

  useEffect(() => {
    if (!minimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [dialog?.messages.length, minimized]);

  async function sendMessage() {
    if (!composerText.trim() && composerAttachments.length === 0) return;
    setSending(true);
    try {
      const res = await fetch(`/api/livechat/dialogs/${dialogId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: composerText.trim(),
          attachments: composerAttachments.map((a, i) => ({
            id: `att_${i}`,
            fileName: a.name,
            mimeType: a.type,
            dataUrl: a.dataUrl,
            kind: a.type.startsWith("image/") ? "image" : "file",
            sizeBytes: a.size,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      setComposerText("");
      setComposerAttachments([]);
      setShowEmojiPicker(false);
      await loadDialog(true);
    } catch {
      toast.error("Failed to send");
    } finally {
      setSending(false);
    }
  }

  const title = dialog?.subject || "Loading...";
  const subtitle = dialog?.visitorName || dialog?.visitorEmail || "Visitor";

  // Suppress unused variable warning for agents/canManage — they may be used in future extensions
  void agents;
  void canManage;

  return (
    <div
      className={cn(
        "flex w-[300px] flex-col rounded-t-xl border border-b-0 bg-white shadow-2xl transition-all",
        minimized ? "h-12" : "h-[420px]"
      )}
    >
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between gap-2 rounded-t-xl bg-[#AA8038] px-3 py-2.5 text-white"
        onClick={() => setMinimized((v) => !v)}
      >
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{title}</p>
          {!minimized ? <p className="truncate text-[10px] text-white/80">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMinimized((v) => !v); }}
            className="rounded p-0.5 hover:bg-white/20"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="rounded p-0.5 hover:bg-white/20"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!minimized ? (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-1 p-2">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            ) : (dialog?.messages ?? []).map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  msg.isSystem ? "bg-slate-50 text-slate-400 text-center" : msg.userId ? "bg-slate-100 text-slate-800" : "bg-[#AA8038]/10 text-slate-800"
                )}
              >
                {!msg.isSystem ? (
                  <p className="text-[10px] font-medium text-slate-500 mb-0.5">
                    {msg.userId ? msg.user.name : "Visitor"}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap">{renderWithLinks(msg.payload.text)}</p>
              </div>
            ))}
            {typingUsers.length > 0 ? (
              <div className="flex items-center gap-1 px-1 text-[10px] text-slate-400">
                <span className="flex gap-0.5">
                  {[0, 150, 300].map((delay) => (
                    <span key={delay} className="h-1 w-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </span>
                {typingUsers.join(", ")} typing...
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          {dialog?.status === "open" && canWrite ? (
            <div className="border-t bg-white p-2 space-y-1">
              {/* Emoji picker */}
              {showEmojiPicker ? (
                <div className="flex flex-wrap gap-0.5 rounded border bg-white p-1.5">
                  {["😊","😂","❤️","👍","🙏","😍","🎉","🔥","👋","😭","🤔","😁","🥰","😎","💪","✅","🙌","💯","🤝","😢","😅","🙃","😆","🥲","😉","💬","📎","🌟","🚀","💡"].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => { setComposerText((p) => p + emoji); setShowEmojiPicker(false); }}
                      className="rounded p-0.5 text-base hover:bg-slate-100"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
              {/* Attachment previews */}
              {composerAttachments.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {composerAttachments.map((a, i) => (
                    <div key={i} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                      <span className="max-w-[80px] truncate">{a.name}</span>
                      <button type="button" onClick={() => setComposerAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">×</button>
                    </div>
                  ))}
                </div>
              ) : null}
              {/* Toolbar */}
              <div className="flex items-center gap-0.5 border-b border-slate-100 pb-1">
                <button
                  type="button"
                  title="Emoji"
                  onClick={() => setShowEmojiPicker((s) => !s)}
                  className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <Smile className="h-3.5 w-3.5" />
                </button>
                <label title="Attach file" className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <Paperclip className="h-3.5 w-3.5" />
                  <input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const MAX = 4 * 1024 * 1024;
                      const files = Array.from(e.target.files ?? []);
                      const oversized = files.filter((f) => f.size > MAX);
                      if (oversized.length > 0) toast.error(`File too large (max 4 MB): ${oversized.map((f) => f.name).join(", ")}`);
                      files.filter((f) => f.size <= MAX).slice(0, 5).forEach((file) => {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setComposerAttachments((prev) => [...prev, { name: file.name, dataUrl: ev.target?.result as string, type: file.type, size: file.size }]);
                        };
                        reader.readAsDataURL(file);
                      });
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {/* Input row */}
              <div className="flex items-end gap-1.5">
                <Textarea
                  rows={1}
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  placeholder="Reply..."
                  className="min-h-[34px] flex-1 resize-none text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void sendMessage();
                    }
                    void fetch(`/api/livechat/dialogs/${dialogId}/typing`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: "Agent" }),
                    });
                  }}
                />
                <Button
                  size="sm"
                  disabled={sending || (!composerText.trim() && composerAttachments.length === 0)}
                  onClick={() => void sendMessage()}
                  className="h-8 w-8 shrink-0 bg-[#AA8038] p-0 hover:bg-[#D98D00]"
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizontal className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          ) : dialog?.status === "closed" ? (
            <div className="border-t p-2 text-center text-[10px] text-slate-400">Conversation closed</div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
