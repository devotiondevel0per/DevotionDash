"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type WidgetConfig = {
  enabled: boolean;
  brandLabel: string;
  logoUrl?: string | null;
  welcomeText: string;
  accentColor: string;
  position: "left" | "right";
  categories: { id: string; name: string }[];
};

type TicketStatus = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  comments: { id: string; content: string; isAgent: boolean; isSystem: boolean; authorName: string; createdAt: string }[];
};

const STORAGE_KEY_PREFIX = "tw_ticket_";

function storageKey(widgetToken: string) {
  return `${STORAGE_KEY_PREFIX}${widgetToken}`;
}

function statusColor(status: string) {
  if (status === "closed") return "#6B7280";
  if (status === "pending") return "#F59E0B";
  return "#10B981";
}

function statusLabel(status: string) {
  if (status === "closed") return "Closed";
  if (status === "pending") return "Pending";
  return "Open";
}

function WidgetContent() {
  const searchParams = useSearchParams();
  const widgetToken = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [error, setError] = useState("");

  // Persisted ticket token
  const [ticketToken, setTicketToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem(storageKey(widgetToken)); } catch { return null; }
  });

  // Submit form state
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Ticket view state
  const [ticket, setTicket] = useState<TicketStatus | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [showTrack, setShowTrack] = useState(false);
  const [trackInput, setTrackInput] = useState("");

  // Load widget config
  useEffect(() => {
    if (!widgetToken) { setError("Invalid widget token"); setLoading(false); return; }
    fetch(`/api/public/tickets/widget/${widgetToken}`)
      .then(r => r.json())
      .then((data: WidgetConfig & { error?: string }) => {
        if (data.error) { setError(data.error); return; }
        setConfig(data);
      })
      .catch(() => setError("Failed to load widget"))
      .finally(() => setLoading(false));
  }, [widgetToken]);

  // Load ticket if we have a token
  const loadTicket = useCallback(async (token: string) => {
    setTicketLoading(true);
    try {
      const r = await fetch(`/api/public/tickets/${token}`);
      if (!r.ok) { setTicketToken(null); localStorage.removeItem(storageKey(widgetToken)); return; }
      const data = await r.json() as TicketStatus;
      setTicket(data);
    } finally {
      setTicketLoading(false);
    }
  }, [widgetToken]);

  useEffect(() => {
    if (ticketToken) void loadTicket(ticketToken);
  }, [ticketToken, loadTicket]);

  const accent = config?.accentColor ?? "#B0812B";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    if (!clientName.trim() || !clientEmail.trim() || !title.trim() || !description.trim()) {
      setSubmitError("Please fill in all fields.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/public/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgetToken, clientName: clientName.trim(), clientEmail: clientEmail.trim(), title: title.trim(), description: description.trim(), categoryId: categoryId || undefined }),
      });
      const data = await r.json() as { token?: string; error?: string };
      if (!r.ok || !data.token) { setSubmitError(data.error ?? "Failed to submit ticket"); return; }
      localStorage.setItem(storageKey(widgetToken), data.token);
      setTicketToken(data.token);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !ticketToken) return;
    setReplying(true);
    try {
      const r = await fetch(`/api/public/tickets/${ticketToken}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText.trim() }),
      });
      if (r.ok) {
        setReplyText("");
        await loadTicket(ticketToken);
      }
    } finally {
      setReplying(false);
    }
  };

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    const t = trackInput.trim();
    if (!t) return;
    localStorage.setItem(storageKey(widgetToken), t);
    setTicketToken(t);
    setShowTrack(false);
  };

  const handleNewTicket = () => {
    if (ticketToken) {
      localStorage.removeItem(storageKey(widgetToken));
      setTicketToken(null);
      setTicket(null);
    }
    setClientName(""); setClientEmail(""); setTitle(""); setDescription(""); setCategoryId("");
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui, sans-serif", color: "#6B7280" }}>
      Loading...
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui, sans-serif", color: "#EF4444", padding: "16px", textAlign: "center" }}>
      {error}
    </div>
  );

  const brandLabel = config?.brandLabel ?? "Support";
  const welcomeText = config?.welcomeText ?? "Hi! How can we help you today?";
  const categories = config?.categories ?? [];
  const widgetLogoUrl = config?.logoUrl?.trim() || "/logo.png";

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", border: "1px solid #D1D5DB",
    borderRadius: "6px", fontSize: "13px", outline: "none", boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px", display: "block" };
  const btnStyle = (primary = true): React.CSSProperties => ({
    padding: primary ? "9px 18px" : "7px 14px",
    background: primary ? accent : "transparent",
    color: primary ? "#fff" : accent,
    border: primary ? "none" : `1px solid ${accent}`,
    borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit",
  });

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", height: "100vh", display: "flex", flexDirection: "column", background: "#fff" }}>
      {/* Header */}
      <div style={{ background: accent, padding: "14px 16px", color: "#fff", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        <img src={widgetLogoUrl} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "contain", background: "#fff", padding: "2px", border: "1px solid rgba(255,255,255,0.35)" }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: "15px" }}>{brandLabel}</div>
          {!ticketToken && <div style={{ fontSize: "11px", opacity: 0.85 }}>{welcomeText}</div>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {/* Track ticket toggle */}
        {!ticketToken && !showTrack && (
          <div style={{ marginBottom: "12px", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setShowTrack(true)} style={{ fontSize: "12px", color: accent, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
              Track existing ticket
            </button>
          </div>
        )}

        {/* Track ticket form */}
        {showTrack && (
          <form onSubmit={handleTrack} style={{ marginBottom: "16px", background: "#F9FAFB", borderRadius: "8px", padding: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px", color: "#111827" }}>Enter your ticket token</div>
            <input value={trackInput} onChange={e => setTrackInput(e.target.value)} placeholder="Paste your ticket token" style={inputStyle} />
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              <button type="submit" style={btnStyle()}>Find Ticket</button>
              <button type="button" onClick={() => setShowTrack(false)} style={btnStyle(false)}>Cancel</button>
            </div>
          </form>
        )}

        {/* Ticket view */}
        {ticketToken && (
          ticketLoading ? (
            <div style={{ textAlign: "center", color: "#6B7280", fontSize: "13px", paddingTop: "40px" }}>Loading ticket...</div>
          ) : ticket ? (
            <div>
              {/* Ticket header */}
              <div style={{ background: "#F9FAFB", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "#111827", flex: 1 }}>{ticket.title}</div>
                  <span style={{ background: statusColor(ticket.status), color: "#fff", borderRadius: "99px", padding: "2px 10px", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {statusLabel(ticket.status)}
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "4px" }}>
                  Opened {new Date(ticket.createdAt).toLocaleDateString()}
                </div>
              </div>

              {/* Comments */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                {ticket.comments.length === 0 && (
                  <div style={{ fontSize: "12px", color: "#9CA3AF", textAlign: "center", padding: "20px 0" }}>
                    No replies yet. An agent will respond soon.
                  </div>
                )}
                {ticket.comments.map(c => (
                  <div key={c.id} style={{
                    alignSelf: c.isAgent ? "flex-start" : "flex-end",
                    maxWidth: "85%",
                    background: c.isAgent ? "#F3F4F6" : accent + "1A",
                    borderRadius: "10px",
                    padding: "8px 12px",
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: c.isAgent ? "#374151" : accent, marginBottom: "3px" }}>
                      {c.isAgent ? c.authorName : "You"}
                    </div>
                    <div style={{ fontSize: "13px", color: "#111827", whiteSpace: "pre-wrap" }}>{c.content}</div>
                    <div style={{ fontSize: "10px", color: "#9CA3AF", marginTop: "3px" }}>
                      {new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply form */}
              {ticket.status !== "closed" && (
                <form onSubmit={e => { void handleReply(e); }} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Write a reply..."
                    rows={3}
                    style={{ ...inputStyle, resize: "none" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button type="button" onClick={handleNewTicket} style={{ fontSize: "12px", color: "#6B7280", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      + New ticket
                    </button>
                    <button type="submit" disabled={replying || !replyText.trim()} style={{ ...btnStyle(), opacity: replying || !replyText.trim() ? 0.6 : 1 }}>
                      {replying ? "Sending..." : "Send Reply"}
                    </button>
                  </div>
                </form>
              )}
              {ticket.status === "closed" && (
                <div style={{ textAlign: "center", marginTop: "8px" }}>
                  <button onClick={handleNewTicket} style={btnStyle()}>Submit New Ticket</button>
                </div>
              )}
            </div>
          ) : null
        )}

        {/* Submit form */}
        {!ticketToken && !showTrack && (
          <form onSubmit={e => { void handleSubmit(e); }} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Your Name *</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="John Smith" style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Email Address *</label>
              <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="john@example.com" style={inputStyle} required />
            </div>
            {categories.length > 0 && (
              <div>
                <label style={labelStyle}>Category</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={inputStyle}>
                  <option value="">— Select category —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={labelStyle}>Subject *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief summary of your issue" style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Message *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your issue in detail..." rows={4} style={{ ...inputStyle, resize: "none" }} required />
            </div>
            {submitError && <div style={{ fontSize: "12px", color: "#EF4444" }}>{submitError}</div>}
            <button type="submit" disabled={submitting} style={{ ...btnStyle(), opacity: submitting ? 0.6 : 1 }}>
              {submitting ? "Submitting..." : "Submit Ticket"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function WidgetPage() {
  return (
    <Suspense>
      <WidgetContent />
    </Suspense>
  );
}
