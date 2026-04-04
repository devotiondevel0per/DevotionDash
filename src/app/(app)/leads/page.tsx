"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, Calendar, ChevronRight, Loader2, Mail,
  Plus, Trash2, TrendingUp, UserCheck, Users, X, PhoneCall,
  FileText, Star, Target, DollarSign, Activity, Search, Edit2,
  CheckCircle2, XCircle, Archive, ArrowRight, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";

// ─── Types ──────────────────────────────────────────────────────────────────

type LeadRecord = {
  id: string; title: string; companyName: string; contactName: string | null;
  email: string | null; phone: string | null; country: string | null;
  language: string | null; source: string | null; priority: string;
  stage: string; stageLabel: string; status: string;
  expectedDeposit: number | null; score: number; notes: string | null;
  followUpAt: string | null; closedAt: string | null;
  ownerId: string | null; organizationId: string | null; contactId: string | null;
  createdAt: string; updatedAt: string;
  owner: { id: string; name: string; fullname: string } | null;
  organization: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  activitiesCount: number;
  customData: Record<string, unknown> | null;
};

type LeadActivity = {
  id: string; type: string; content: string;
  scheduledAt: string | null; createdAt: string;
  user: { id: string; name: string; fullname: string } | null;
};

type LeadDetail = LeadRecord & { activities: LeadActivity[] };

type LeadCustomFieldType = "text" | "textarea" | "number" | "checkbox" | "dropdown" | "date";
type LeadCustomField = {
  id: string; type: LeadCustomFieldType; label: string; enabled: boolean;
  required: boolean; order: number; placeholder: string; options: string[];
};

type LeadOwnerOption = {
  id: string;
  name: string;
  fullname: string;
  email: string | null;
};

type LeadsResponse = {
  stageFlow: string[]; sourceOptions: string[];
  formFields: Array<{ id: string; label: string; enabled: boolean; required: boolean; order: number; placeholder: string }>;
  customFields: LeadCustomField[];
  owners?: Array<{ id: string; name: string; fullname: string; email: string | null }>;
  currentUserId?: string;
  leads: LeadRecord[];
};

type ReportsData = {
  summary: { total: number; open: number; won: number; lost: number; archived: number; conversionRate: number; avgDaysToWin: number; pipelineValue: number };
  stageBreakdown: Array<{ stage: string; label: string; count: number; share: number }>;
  sourceBreakdown: Array<{ source: string; count: number; share: number }>;
  priorityBreakdown: Array<{ priority: string; count: number }>;
  ownerBreakdown: Array<{ ownerId: string | null; name: string; total: number; won: number; conversionRate: number }>;
  monthlyStats: Array<{ month: string; label: string; newLeads: number; wonLeads: number }>;
  recentWon: Array<{ id: string; title: string; companyName: string; owner: string; updatedAt: string }>;
};

type CreateForm = {
  title: string; companyName: string; contactName: string; email: string;
  phone: string; country: string; language: string; source: string;
  priority: "low" | "normal" | "high"; notes: string; expectedDeposit: string;
  ownerId: string;
  customData: Record<string, unknown>;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-700 border-slate-200",
  qualified: "bg-blue-100 text-blue-700 border-blue-200",
  proposal: "bg-indigo-100 text-indigo-700 border-indigo-200",
  negotiation: "bg-amber-100 text-amber-700 border-amber-200",
  won: "bg-emerald-100 text-emerald-700 border-emerald-200",
  lost: "bg-rose-100 text-rose-700 border-rose-200",
  archived: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

const STAGE_DOT: Record<string, string> = {
  new: "bg-slate-400", qualified: "bg-blue-500", proposal: "bg-indigo-500",
  negotiation: "bg-amber-500", won: "bg-emerald-500", lost: "bg-rose-500", archived: "bg-neutral-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-rose-600 bg-rose-50 border-rose-200",
  normal: "text-amber-600 bg-amber-50 border-amber-200",
  low: "text-slate-500 bg-slate-50 border-slate-200",
};

const ACTIVITY_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  note: { icon: <FileText className="h-3.5 w-3.5" />, color: "text-blue-600 bg-blue-50", label: "Note" },
  call: { icon: <PhoneCall className="h-3.5 w-3.5" />, color: "text-green-600 bg-green-50", label: "Call" },
  email: { icon: <Mail className="h-3.5 w-3.5" />, color: "text-purple-600 bg-purple-50", label: "Email" },
  meeting: { icon: <Users className="h-3.5 w-3.5" />, color: "text-orange-600 bg-orange-50", label: "Meeting" },
  follow_up: { icon: <Calendar className="h-3.5 w-3.5" />, color: "text-pink-600 bg-pink-50", label: "Follow-up" },
  stage_change: { icon: <ArrowRight className="h-3.5 w-3.5" />, color: "text-indigo-600 bg-indigo-50", label: "Stage" },
  system: { icon: <Activity className="h-3.5 w-3.5" />, color: "text-slate-500 bg-slate-100", label: "System" },
};

const SOURCE_COLORS = ["#FE0000", "#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ec4899", "#06b6d4", "#f97316"];

const EMPTY_CREATE: CreateForm = {
  title: "", companyName: "", contactName: "", email: "", phone: "",
  country: "", language: "", source: "", priority: "normal", notes: "", expectedDeposit: "",
  ownerId: "",
  customData: {},
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function fmtDate(value: string) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(value: string) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fullName(user: { name: string; fullname: string } | null) {
  return user?.fullname?.trim() || user?.name || "Unassigned";
}

function stageLabel(s: string) {
  return s.replace(/_/g, " ").split(" ").map((p) => p[0]?.toUpperCase() + p.slice(1)).join(" ");
}

function currencyFmt(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function isConvertible(lead: LeadRecord) {
  if (lead.status === "lost" || lead.status === "archived") return false;
  if (!lead.organizationId) return true;
  if (!lead.contactId && (lead.contactName || lead.email || lead.phone)) return true;
  return false;
}

// ─── SVG Charts ──────────────────────────────────────────────────────────────

function StageFunnelChart({ stages }: { stages: Array<{ label: string; count: number; stage: string }> }) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="space-y-2">
      {stages.map((s) => {
        const pct = (s.count / max) * 100;
        const dotColor = STAGE_DOT[s.stage] ?? "bg-slate-400";
        return (
          <div key={s.stage} className="flex items-center gap-2">
            <div className="w-24 shrink-0 text-right text-xs text-slate-600">{s.label}</div>
            <div className="flex-1 rounded-full bg-slate-100 h-5 overflow-hidden">
              <div
                className={cn("h-5 rounded-full transition-all duration-500", dotColor)}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <div className="w-8 shrink-0 text-right text-xs font-semibold text-slate-700">{s.count}</div>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ data, colors }: { data: Array<{ label: string; count: number }>; colors: string[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <p className="text-xs text-slate-400 text-center py-4">No data</p>;
  const cx = 60, cy = 60, r = 48, inner = 30;
  let angle = -90;
  const segments: React.ReactElement[] = [];
  data.forEach((d, i) => {
    if (d.count === 0) return;
    const sweep = (d.count / total) * 360;
    const end = angle + sweep;
    const sr = (angle * Math.PI) / 180, er = (end * Math.PI) / 180;
    const x1 = cx + r * Math.cos(sr), y1 = cy + r * Math.sin(sr);
    const x2 = cx + r * Math.cos(er), y2 = cy + r * Math.sin(er);
    const ix1 = cx + inner * Math.cos(sr), iy1 = cy + inner * Math.sin(sr);
    const ix2 = cx + inner * Math.cos(er), iy2 = cy + inner * Math.sin(er);
    const large = sweep > 180 ? 1 : 0;
    segments.push(
      <path
        key={i}
        d={`M${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} L${ix2},${iy2} A${inner},${inner},0,${large},0,${ix1},${iy1}Z`}
        fill={colors[i % colors.length]}
        stroke="white"
        strokeWidth={1}
      />
    );
    angle = end;
  });
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 120 120" width={100} height={100} className="shrink-0">
        {segments}
      </svg>
      <div className="space-y-1 min-w-0">
        {data.slice(0, 6).map((d, i) => (
          <div key={d.label} className="flex items-center gap-1.5 text-xs">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: colors[i % colors.length] }} />
            <span className="truncate text-slate-600">{d.label}</span>
            <span className="ml-auto font-semibold text-slate-800 shrink-0">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyBarChart({ stats }: { stats: Array<{ label: string; newLeads: number; wonLeads: number }> }) {
  const max = Math.max(...stats.flatMap((s) => [s.newLeads, s.wonLeads]), 1);
  const H = 80;
  return (
    <div>
      <div className="flex items-end justify-between gap-1" style={{ height: H + 16 }}>
        {stats.map((s) => (
          <div key={s.label} className="flex flex-1 flex-col items-center gap-0.5">
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height: H }}>
              <div
                className="flex-1 rounded-t bg-rose-400 opacity-70 transition-all duration-500"
                style={{ height: `${(s.newLeads / max) * H}px`, minHeight: s.newLeads ? 2 : 0 }}
                title={`New: ${s.newLeads}`}
              />
              <div
                className="flex-1 rounded-t bg-emerald-500 transition-all duration-500"
                style={{ height: `${(s.wonLeads / max) * H}px`, minHeight: s.wonLeads ? 2 : 0 }}
                title={`Won: ${s.wonLeads}`}
              />
            </div>
            <span className="text-[10px] text-slate-500">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-center gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-rose-400 opacity-70" />New</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-emerald-500" />Won</span>
      </div>
    </div>
  );
}

// ─── Lead Detail Sheet ────────────────────────────────────────────────────────

function LeadDetailSheet({
  lead, stageFlow, sourceOptions, customFields, owners, currentUserId, canWrite, canManage,
  onClose, onSaved, onDeleted, onConverted,
}: {
  lead: LeadDetail;
  stageFlow: string[];
  sourceOptions: string[];
  customFields: LeadCustomField[];
  owners: LeadOwnerOption[];
  currentUserId: string;
  canWrite: boolean;
  canManage: boolean;
  onClose: () => void;
  onSaved: (updated: LeadDetail) => void;
  onDeleted: (id: string) => void;
  onConverted: () => void;
}) {
  const [tab, setTab] = useState<"info" | "activity">("info");
  const [form, setForm] = useState({
    title: lead.title, companyName: lead.companyName, contactName: lead.contactName ?? "",
    email: lead.email ?? "", phone: lead.phone ?? "", country: lead.country ?? "",
    source: lead.source ?? "", priority: lead.priority, stage: lead.stage,
    expectedDeposit: lead.expectedDeposit?.toString() ?? "", score: lead.score.toString(),
    notes: lead.notes ?? "",
    ownerId: lead.ownerId ?? "",
    followUpAt: lead.followUpAt ? new Date(lead.followUpAt).toISOString().slice(0, 10) : "",
    customData: (lead.customData as Record<string, unknown>) ?? {},
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [busyStage, setBusyStage] = useState(false);
  const [activities, setActivities] = useState<LeadActivity[]>(lead.activities);
  const [actForm, setActForm] = useState({ type: "note", content: "", scheduledAt: "" });
  const [addingAct, setAddingAct] = useState(false);

  async function save() {
    if (!form.title.trim() || !form.companyName.trim()) {
      toast.error("Title and Company are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title, companyName: form.companyName,
          contactName: form.contactName || null, email: form.email || null,
          phone: form.phone || null, country: form.country || null,
          source: form.source || null, priority: form.priority, stage: form.stage,
          expectedDeposit: form.expectedDeposit ? Number(form.expectedDeposit) : null,
          score: Number(form.score) || 0,
          notes: form.notes || null,
          ownerId: canManage ? (form.ownerId || null) : currentUserId,
          followUpAt: form.followUpAt || null,
          customData: Object.keys(form.customData).length > 0 ? form.customData : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to save");
      const updated = await res.json() as LeadDetail;
      toast.success("Lead updated");
      setActivities(updated.activities ?? activities);
      onSaved(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function quickStage(targetStage: string) {
    setBusyStage(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", stage: targetStage }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed");
      toast.success(`Marked as ${stageLabel(targetStage)}`);
      // Reload detail
      const detail = await fetch(`/api/leads/${lead.id}`).then((r) => r.json()) as LeadDetail;
      setActivities(detail.activities ?? []);
      setForm((f) => ({ ...f, stage: detail.stage }));
      onSaved(detail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyStage(false);
    }
  }

  async function deleteLead() {
    if (!window.confirm("Delete this lead? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to delete");
      toast.success("Lead deleted");
      onDeleted(lead.id);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  async function convertLead() {
    setConverting(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed");
      toast.success("Lead converted to organization/contact");
      onConverted();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to convert");
    } finally {
      setConverting(false);
    }
  }

  async function addActivity() {
    if (!actForm.content.trim()) { toast.error("Activity note is required"); return; }
    setAddingAct(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: actForm.type,
          content: actForm.content,
          scheduledAt: actForm.scheduledAt || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed");
      const newAct = await res.json() as LeadActivity;
      setActivities((prev) => [newAct, ...prev]);
      setActForm({ type: "note", content: "", scheduledAt: "" });
      toast.success("Activity added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setAddingAct(false);
    }
  }

  const stageColor = STAGE_COLORS[form.stage] ?? STAGE_COLORS.new;
  const isTerminal = ["won", "lost", "archived"].includes(form.stage);

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn("text-xs font-medium border", stageColor)}>{stageLabel(form.stage)}</Badge>
            <Badge variant="outline" className={cn("text-xs border", PRIORITY_COLORS[lead.priority])}>{lead.priority}</Badge>
            {lead.organizationId && <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-200">Linked</Badge>}
          </div>
          <h2 className="mt-1 text-base font-semibold text-slate-900 truncate">{lead.title}</h2>
          <p className="text-xs text-slate-500">{lead.companyName} · {fullName(lead.owner)}</p>
        </div>
        <button onClick={onClose} className="mt-0.5 rounded p-1 hover:bg-slate-100">
          <X className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1.5 border-b px-4 py-2 bg-slate-50">
        {!isTerminal && canManage && (
          <>
            <Button size="sm" variant="outline"
              className="h-7 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              disabled={busyStage} onClick={() => quickStage("won")}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Won
            </Button>
            <Button size="sm" variant="outline"
              className="h-7 text-xs text-rose-700 border-rose-300 hover:bg-rose-50"
              disabled={busyStage} onClick={() => quickStage("lost")}>
              <XCircle className="mr-1 h-3.5 w-3.5" />Lost
            </Button>
            <Button size="sm" variant="outline"
              className="h-7 text-xs text-slate-600"
              disabled={busyStage} onClick={() => quickStage("archived")}>
              <Archive className="mr-1 h-3.5 w-3.5" />Archive
            </Button>
          </>
        )}
        {isConvertible(lead) && canManage && (
          <Button size="sm" className="h-7 text-xs bg-[#FE0000] text-white hover:bg-[#d90000] ml-auto"
            disabled={converting} onClick={convertLead}>
            {converting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="mr-1 h-3.5 w-3.5" />}
            Convert
          </Button>
        )}
        {canWrite && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600 ml-auto"
            disabled={deleting} onClick={deleteLead}>
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "info" | "activity")} className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-3 grid w-auto grid-cols-2">
          <TabsTrigger value="info">Details</TabsTrigger>
          <TabsTrigger value="activity">
            Activity <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-[10px]">{activities.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="mt-3 grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Lead Title *</Label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Company *</Label>
                <Input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Contact Name</Label>
                <Input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} className="h-8 text-sm" placeholder="Jane Doe" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Country</Label>
                <Input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Stage</Label>
                <Select value={form.stage} onValueChange={(v) => v && setForm((f) => ({ ...f, stage: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...stageFlow, "lost", "archived"].map((s) => (
                      <SelectItem key={s} value={s}>{stageLabel(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => v && setForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Source</Label>
                <Input value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  className="h-8 text-sm" list="detail-source-opts" />
                <datalist id="detail-source-opts">
                  {sourceOptions.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expected Value ($)</Label>
                <Input type="number" value={form.expectedDeposit}
                  onChange={(e) => setForm((f) => ({ ...f, expectedDeposit: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Owner</Label>
              <Select
                value={form.ownerId || "unassigned"}
                onValueChange={(v) => v && setForm((f) => ({ ...f, ownerId: v === "unassigned" ? "" : v }))}
                disabled={!canManage}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {owners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {(owner.fullname || owner.name).trim() || owner.email || owner.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Score (0–100)</Label>
                <Input type="number" min={0} max={100} value={form.score}
                  onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Follow-up Date</Label>
                <Input type="date" value={form.followUpAt}
                  onChange={(e) => setForm((f) => ({ ...f, followUpAt: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className="text-sm resize-none" />
            </div>

            {/* Custom fields */}
            {customFields.filter((cf) => cf.enabled).sort((a, b) => a.order - b.order).map((cf) => (
              <div key={cf.id} className="space-y-1">
                {cf.type !== "checkbox" && (
                  <Label className="text-xs">{cf.label}{cf.required && " *"}</Label>
                )}
                <CustomFieldInput
                  field={cf}
                  value={form.customData[cf.id]}
                  onChange={(val) => setForm((f) => ({ ...f, customData: { ...f.customData, [cf.id]: val } }))}
                  disabled={!canWrite}
                />
              </div>
            ))}

            {/* Linked info */}
            {(lead.organization || lead.contact) && (
              <div className="rounded-md border bg-slate-50 p-2.5 text-xs space-y-1">
                {lead.organization && (
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Building2 className="h-3 w-3" /><span>{lead.organization.name}</span>
                  </div>
                )}
                {lead.contact && (
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <UserCheck className="h-3 w-3" /><span>{lead.contact.firstName} {lead.contact.lastName}</span>
                  </div>
                )}
              </div>
            )}
            <div className="text-[11px] text-slate-400 space-y-0.5">
              <div>Created {fmtDateTime(lead.createdAt)}</div>
              <div>Updated {fmtDateTime(lead.updatedAt)}</div>
            </div>
          </div>
          {canWrite && (
            <Button className="mt-4 w-full bg-[#FE0000] text-white hover:bg-[#d90000]" onClick={save} disabled={saving}>
              {saving ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Saving...</> : <><Edit2 className="mr-1.5 h-4 w-4" />Save Changes</>}
            </Button>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-0 flex-1 overflow-y-auto px-4 pb-4">
          {canWrite && (
            <div className="mt-3 space-y-2 rounded-lg border bg-slate-50 p-3">
              <div className="flex gap-2">
                <Select value={actForm.type} onValueChange={(v) => v && setActForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                  </SelectContent>
                </Select>
                {actForm.type === "follow_up" && (
                  <Input type="datetime-local" value={actForm.scheduledAt}
                    onChange={(e) => setActForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                    className="h-8 flex-1 text-xs" />
                )}
              </div>
              <Textarea value={actForm.content}
                onChange={(e) => setActForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Add notes, call summary, meeting recap..."
                rows={2} className="text-sm resize-none" />
              <Button size="sm" className="bg-[#FE0000] text-white hover:bg-[#d90000]"
                disabled={addingAct} onClick={addActivity}>
                {addingAct ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                Add Activity
              </Button>
            </div>
          )}
          <div className="mt-3 space-y-2">
            {activities.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">No activity yet.</p>
            )}
            {activities.map((act) => {
              const meta = ACTIVITY_META[act.type] ?? ACTIVITY_META.note;
              return (
                <div key={act.id} className="flex gap-2.5">
                  <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", meta.color)}>
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{fullName(act.user)}</span>
                      <span>·</span>
                      <span>{fmtDateTime(act.createdAt)}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">{meta.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-800 whitespace-pre-wrap">{act.content}</p>
                    {act.scheduledAt && (
                      <p className="mt-0.5 text-xs text-amber-600 flex items-center gap-1">
                        <Clock className="h-3 w-3" />Scheduled: {fmtDateTime(act.scheduledAt)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Custom Field Renderer ────────────────────────────────────────────────────

function CustomFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: LeadCustomField;
  value: unknown;
  onChange: (val: unknown) => void;
  disabled?: boolean;
}) {
  const cls = "text-sm";
  if (field.type === "textarea") {
    return (
      <Textarea
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={3}
        className={cn(cls, "resize-none")}
        disabled={disabled}
      />
    );
  }
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded"
        />
        <span className="text-sm text-slate-700">{field.label}</span>
      </label>
    );
  }
  if (field.type === "dropdown") {
    return (
      <Select value={typeof value === "string" ? value : ""} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={field.placeholder || "Select..."} /></SelectTrigger>
        <SelectContent>
          {field.options.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "number") {
    return (
      <Input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder={field.placeholder}
        className={cn(cls, "h-8")}
        disabled={disabled}
      />
    );
  }
  if (field.type === "date") {
    return (
      <Input
        type="date"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        className={cn(cls, "h-8")}
        disabled={disabled}
      />
    );
  }
  // default: text
  return (
    <Input
      type="text"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className={cn(cls, "h-8")}
      disabled={disabled}
    />
  );
}

const SECTIONS = [
  { id: "dashboard", label: "Dashboard", minAction: "read" },
  { id: "leads", label: "All Leads", minAction: "read" },
  { id: "pipeline", label: "Pipeline", minAction: "read" },
  { id: "conversions", label: "Conversions", minAction: "write" },
  { id: "reports", label: "Reports", minAction: "manage" },
] as const;

type SectionId = typeof SECTIONS[number]["id"];

export default function LeadsPage() {
  const { can, loading } = usePermissions();
  const canRead = can("leads", "read");
  const canWrite = can("leads", "write");
  const canManage = can("leads", "manage");

  const [section, setSection] = useState<SectionId>("dashboard");
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [stageFlow, setStageFlow] = useState<string[]>([]);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [formFields, setFormFields] = useState<LeadsResponse["formFields"]>([]);
  const [customFields, setCustomFields] = useState<LeadCustomField[]>([]);
  const [owners, setOwners] = useState<LeadOwnerOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [reports, setReports] = useState<ReportsData | null>(null);

  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);

  // Lead detail sheet
  const [selectedDetail, setSelectedDetail] = useState<LeadDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);

  // Filters
  const [filterStage, setFilterStage] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterOwner, setFilterOwner] = useState("all");
  const [search, setSearch] = useState("");

  // Busy state for pipeline complete
  const [busyId, setBusyId] = useState<string | null>(null);

  const allowedSections = useMemo(
    () => SECTIONS.filter((s) => can("leads", s.minAction as "read" | "write" | "manage")),
    [can]
  );

  // Validate section
  useEffect(() => {
    if (!allowedSections.some((s) => s.id === section)) {
      setSection(allowedSections[0]?.id ?? "dashboard");
    }
  }, [allowedSections, section]);

  const loadLeads = useCallback(async () => {
    if (!canRead) return;
    setLoadingLeads(true);
    try {
      const res = await fetch("/api/leads?limit=500", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load leads");
      const data = await res.json() as LeadsResponse;
      setLeads(data.leads ?? []);
      setStageFlow(data.stageFlow ?? []);
      setSourceOptions(data.sourceOptions ?? []);
      setFormFields(data.formFields ?? []);
      setCustomFields(data.customFields ?? []);
      const ownerOptions = Array.isArray(data.owners) ? data.owners : [];
      setOwners(ownerOptions);
      if (data.currentUserId) {
        setCurrentUserId(data.currentUserId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load leads");
    } finally {
      setLoadingLeads(false);
    }
  }, [canRead]);

  const loadReports = useCallback(async () => {
    if (!canManage) return;
    setLoadingReports(true);
    try {
      const res = await fetch("/api/leads/reports", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load reports");
      setReports(await res.json() as ReportsData);
    } catch {
      toast.error("Failed to load reports");
    } finally {
      setLoadingReports(false);
    }
  }, [canManage]);

  useEffect(() => { void loadLeads(); }, [loadLeads]);
  useEffect(() => {
    if (section === "reports" && canManage) void loadReports();
  }, [section, canManage, loadReports]);
  useEffect(() => {
    if (!currentUserId) return;
    if (!canManage) {
      setCreateForm((prev) => (prev.ownerId === currentUserId ? prev : { ...prev, ownerId: currentUserId }));
    }
  }, [canManage, currentUserId]);

  async function openDetail(lead: LeadRecord) {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load lead");
      setSelectedDetail(await res.json() as LeadDetail);
    } catch {
      toast.error("Failed to load lead details");
    } finally {
      setLoadingDetail(false);
    }
  }

  function handleSaved(updated: LeadDetail) {
    setLeads((prev) => prev.map((l) => l.id === updated.id ? { ...l, ...updated, activitiesCount: updated.activities.length } : l));
    setSelectedDetail(updated);
  }

  function handleDeleted(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setSelectedDetail(null);
  }

  async function completeStage(lead: LeadRecord) {
    if (!canWrite) return;
    setBusyId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const payload = await res.json().catch(() => null) as { message?: string; error?: string; lead?: Partial<LeadRecord> } | null;
      if (!res.ok) throw new Error(payload?.error ?? "Failed");
      toast.success(payload?.message ?? "Stage updated");
      if (payload?.lead) {
        setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, ...payload.lead } : l));
      } else {
        await loadLeads();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function convertLead(lead: LeadRecord) {
    if (!canWrite) return;
    setBusyId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, { method: "POST" });
      const payload = await res.json().catch(() => null) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error ?? "Failed");
      toast.success(payload?.message ?? "Lead converted");
      await loadLeads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to convert");
    } finally {
      setBusyId(null);
    }
  }

  async function createLead() {
    if (!createForm.title.trim()) { toast.error("Title is required"); return; }
    if (!createForm.companyName.trim()) { toast.error("Company is required"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createForm.title, companyName: createForm.companyName,
          contactName: createForm.contactName || null, email: createForm.email || null,
          phone: createForm.phone || null, country: createForm.country || null,
          source: createForm.source || null, priority: createForm.priority,
          ownerId: canManage ? (createForm.ownerId || null) : (currentUserId || null),
          notes: createForm.notes || null,
          expectedDeposit: createForm.expectedDeposit ? Number(createForm.expectedDeposit) : null,
          customData: Object.keys(createForm.customData).length > 0 ? createForm.customData : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed");
      toast.success("Lead created");
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE);
      await loadLeads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create lead");
    } finally {
      setCreating(false);
    }
  }

  // ── Computed values ──────────────────────────────────────────────────────

  const nextStageMap = useMemo(() => {
    const m = new Map<string, string | null>();
    stageFlow.forEach((s, i) => m.set(s, stageFlow[i + 1] ?? null));
    m.set("lost", null); m.set("archived", null);
    return m;
  }, [stageFlow]);

  const kpis = useMemo(() => {
    const total = leads.length;
    const open = leads.filter((l) => l.status === "open").length;
    const won = leads.filter((l) => l.status === "won").length;
    const lost = leads.filter((l) => l.status === "lost").length;
    const conversionRate = (won + lost) > 0 ? (won / (won + lost)) * 100 : 0;
    const pipelineValue = leads.filter((l) => l.status === "open").reduce((s, l) => s + (l.expectedDeposit ?? 0), 0);
    const wonArr = leads.filter((l) => l.status === "won");
    const avgDays = wonArr.length > 0
      ? wonArr.reduce((s, l) => s + (new Date(l.updatedAt).getTime() - new Date(l.createdAt).getTime()) / 86400000, 0) / wonArr.length
      : 0;
    return { total, open, won, lost, conversionRate, pipelineValue, avgDays };
  }, [leads]);

  const stageStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) map.set(l.stage, (map.get(l.stage) ?? 0) + 1);
    return stageFlow.map((s) => ({ stage: s, label: stageLabel(s), count: map.get(s) ?? 0 })).filter((s) => s.count > 0);
  }, [leads, stageFlow]);

  const sourceStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      const src = l.source?.trim() || "Unknown";
      map.set(src, (map.get(src) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 7);
  }, [leads]);

  const monthlyStats = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const next = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 1);
      return {
        month: `${date.getFullYear()}-${date.getMonth()}`,
        label: date.toLocaleString("default", { month: "short" }),
        newLeads: leads.filter((l) => new Date(l.createdAt) >= date && new Date(l.createdAt) < next).length,
        wonLeads: leads.filter((l) => l.status === "won" && new Date(l.updatedAt) >= date && new Date(l.updatedAt) < next).length,
      };
    });
  }, [leads]);

  const followUpsThisWeek = useMemo(() => {
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 86400000);
    return leads.filter((l) => l.followUpAt && new Date(l.followUpAt) >= now && new Date(l.followUpAt) <= week)
      .sort((a, b) => new Date(a.followUpAt!).getTime() - new Date(b.followUpAt!).getTime());
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (filterStage !== "all" && l.stage !== filterStage) return false;
      if (filterPriority !== "all" && l.priority !== filterPriority) return false;
      if (filterSource !== "all" && (l.source ?? "Unknown") !== filterSource) return false;
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      if (filterOwner !== "all") {
        if (filterOwner === "unassigned" && l.ownerId) return false;
        if (filterOwner !== "unassigned" && l.ownerId !== filterOwner) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return [l.title, l.companyName, l.contactName, l.email, l.source].some((f) => f?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [leads, filterStage, filterPriority, filterSource, filterStatus, filterOwner, search]);

  const convertibleLeads = useMemo(() => leads.filter(isConvertible), [leads]);

  const pipelineByStage = useMemo(() => {
    const map = new Map<string, LeadRecord[]>();
    for (const s of stageFlow) map.set(s, []);
    for (const l of leads.filter((l) => l.status === "open")) {
      if (map.has(l.stage)) map.get(l.stage)!.push(l);
      else map.set(l.stage, [l]);
    }
    return map;
  }, [leads, stageFlow]);

  const allSources = useMemo(() => Array.from(new Set(leads.map((l) => l.source ?? "Unknown").filter(Boolean))), [leads]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading...</div>;
  if (!canRead) return (
    <div className="p-6">
      <Card><CardContent className="p-6 text-sm text-slate-600">You do not have permission to view Lead Management. Ask your administrator for access.</CardContent></Card>
    </div>
  );

  return (
    <div className={cn("relative p-4 sm:p-6 transition-all duration-300", selectedDetail ? "mr-[520px]" : "")}>
      {/* ── Page Header ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Lead Management</h1>
          <p className="text-sm text-slate-500">Track, manage and convert your sales pipeline.</p>
        </div>
        {canWrite && (
          <Button className="bg-[#FE0000] text-white hover:bg-[#d90000]" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />New Lead
          </Button>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total", value: kpis.total, icon: <Users className="h-4 w-4" />, color: "text-slate-600" },
          { label: "Open", value: kpis.open, icon: <Target className="h-4 w-4" />, color: "text-blue-600" },
          { label: "Won", value: kpis.won, icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-600" },
          { label: "Lost", value: kpis.lost, icon: <XCircle className="h-4 w-4" />, color: "text-rose-600" },
          { label: "Win Rate", value: `${kpis.conversionRate.toFixed(1)}%`, icon: <TrendingUp className="h-4 w-4" />, color: "text-indigo-600" },
          { label: "Pipeline", value: kpis.pipelineValue > 0 ? currencyFmt(kpis.pipelineValue) : "—", icon: <DollarSign className="h-4 w-4" />, color: "text-amber-600" },
        ].map((kpi) => (
          <Card key={kpi.label} className="overflow-hidden">
            <CardContent className="flex items-center justify-between p-3">
              <div>
                <p className="text-xs text-slate-500">{kpi.label}</p>
                <p className="text-xl font-bold text-slate-900">{kpi.value}</p>
              </div>
              <div className={cn("rounded-lg bg-slate-50 p-2", kpi.color)}>{kpi.icon}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Nav Tabs ── */}
      <div className="mb-4 flex flex-wrap gap-2">
        {allowedSections.map((s) => (
          <Button key={s.id} size="sm" variant={s.id === section ? "default" : "outline"}
            className={cn("h-8", s.id === section ? "bg-[#FE0000] text-white hover:bg-[#d90000]" : "")}
            onClick={() => setSection(s.id)}>
            {s.label}
          </Button>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {section === "dashboard" && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Stage funnel */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Stage Funnel</CardTitle></CardHeader>
              <CardContent>
                {stageStats.length > 0
                  ? <StageFunnelChart stages={stageStats} />
                  : <p className="text-xs text-slate-400">No lead data yet.</p>}
              </CardContent>
            </Card>

            {/* Source breakdown */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Lead Sources</CardTitle></CardHeader>
              <CardContent>
                <DonutChart data={sourceStats} colors={SOURCE_COLORS} />
              </CardContent>
            </Card>

            {/* Monthly trend */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monthly Trend</CardTitle></CardHeader>
              <CardContent>
                <MonthlyBarChart stats={monthlyStats} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Follow-ups this week */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />Follow-ups This Week
                  {followUpsThisWeek.length > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 ml-1">{followUpsThisWeek.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {followUpsThisWeek.length === 0
                  ? <p className="text-xs text-slate-400">No follow-ups scheduled this week.</p>
                  : followUpsThisWeek.map((l) => (
                    <div key={l.id} className="flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer hover:bg-slate-50"
                      onClick={() => openDetail(l)}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{l.title}</p>
                        <p className="text-xs text-slate-500">{l.companyName}</p>
                      </div>
                      <span className="text-xs text-amber-600 shrink-0 ml-2">{fmtDate(l.followUpAt!)}</span>
                    </div>
                  ))}
              </CardContent>
            </Card>

            {/* Priority breakdown */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">By Priority</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(["high", "normal", "low"] as const).map((p) => {
                  const count = leads.filter((l) => l.priority === p && l.status === "open").length;
                  const pct = kpis.open > 0 ? (count / kpis.open) * 100 : 0;
                  return (
                    <div key={p}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className={cn("font-medium capitalize", p === "high" ? "text-rose-600" : p === "normal" ? "text-amber-600" : "text-slate-500")}>{p}</span>
                        <span className="text-slate-600">{count} open</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className={cn("h-2 rounded-full transition-all", p === "high" ? "bg-rose-500" : p === "normal" ? "bg-amber-400" : "bg-slate-400")}
                          style={{ width: `${Math.max(pct, 0)}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-1 text-xs text-slate-500">Avg close time: {kpis.avgDays.toFixed(1)} days</div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── All Leads Table ── */}
      {section === "leads" && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search leads..." className="pl-8 h-9" />
              </div>
              <Select value={filterStage} onValueChange={(v) => v && setFilterStage(v)}>
                <SelectTrigger className="h-9 w-32"><SelectValue placeholder="Stage" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  {stageFlow.map((s) => <SelectItem key={s} value={s}>{stageLabel(s)}</SelectItem>)}
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={(v) => v && setFilterPriority(v)}>
                <SelectTrigger className="h-9 w-32"><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={(v) => v && setFilterStatus(v)}>
                <SelectTrigger className="h-9 w-28"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterOwner} onValueChange={(v) => v && setFilterOwner(v)}>
                <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Owner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {owners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {(owner.fullname || owner.name).trim() || owner.email || owner.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-slate-500 ml-1">{filteredLeads.length} leads</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingLeads && <p className="p-4 text-sm text-slate-500">Loading leads...</p>}
            {!loadingLeads && filteredLeads.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-400">
                No leads match the current filters.
              </div>
            )}
            {filteredLeads.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-xs text-slate-600">
                      <th className="px-4 py-2.5 text-left font-medium">Lead</th>
                      <th className="px-3 py-2.5 text-left font-medium">Stage</th>
                      <th className="px-3 py-2.5 text-left font-medium">Priority</th>
                      <th className="px-3 py-2.5 text-left font-medium">Value</th>
                      <th className="px-3 py-2.5 text-left font-medium">Follow-up</th>
                      <th className="px-3 py-2.5 text-left font-medium">Owner</th>
                      <th className="px-3 py-2.5 text-left font-medium">Updated</th>
                      <th className="px-3 py-2.5 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead, idx) => (
                      <tr key={lead.id}
                        className={cn("border-b hover:bg-slate-50 cursor-pointer transition-colors", idx % 2 === 0 ? "" : "bg-slate-50/30")}
                        onClick={() => openDetail(lead)}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900 truncate max-w-[180px]">{lead.title}</p>
                          <p className="text-xs text-slate-500 truncate max-w-[180px]">{lead.companyName}</p>
                        </td>
                        <td className="px-3 py-3">
                          <Badge className={cn("text-xs border font-normal", STAGE_COLORS[lead.stage] ?? STAGE_COLORS.new)}>
                            {lead.stageLabel}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="outline" className={cn("text-xs border capitalize", PRIORITY_COLORS[lead.priority])}>
                            {lead.priority}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-700">
                          {lead.expectedDeposit ? currencyFmt(lead.expectedDeposit) : "—"}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {lead.followUpAt ? (
                            <span className={cn(new Date(lead.followUpAt) < new Date() ? "text-rose-600" : "text-amber-600")}>
                              {fmtDate(lead.followUpAt)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">{fullName(lead.owner)}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">{fmtDate(lead.updatedAt)}</td>
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDetail(lead)}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Pipeline (Kanban) ── */}
      {section === "pipeline" && (
        <div className="overflow-x-auto">
          <div className="flex gap-3 min-w-max pb-2">
            {stageFlow.map((stage) => {
              const stageleads = pipelineByStage.get(stage) ?? [];
              const nextStage = nextStageMap.get(stage);
              return (
                <div key={stage} className="w-64 shrink-0">
                  <div className="mb-2 flex items-center gap-2">
                    <div className={cn("h-2.5 w-2.5 rounded-full", STAGE_DOT[stage] ?? "bg-slate-400")} />
                    <span className="text-sm font-semibold text-slate-700">{stageLabel(stage)}</span>
                    <Badge variant="outline" className="text-xs ml-auto">{stageleads.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {stageleads.map((lead) => (
                      <div key={lead.id}
                        className="rounded-lg border bg-white p-3 shadow-sm hover:shadow-md cursor-pointer transition-shadow"
                        onClick={() => openDetail(lead)}>
                        <p className="text-sm font-semibold text-slate-900 truncate">{lead.title}</p>
                        <p className="text-xs text-slate-500 truncate">{lead.companyName}</p>
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className={cn("text-xs border capitalize", PRIORITY_COLORS[lead.priority])}>
                            {lead.priority}
                          </Badge>
                          {lead.expectedDeposit && (
                            <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-200">
                              {currencyFmt(lead.expectedDeposit)}
                            </Badge>
                          )}
                        </div>
                        {lead.followUpAt && (
                          <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1">
                            <Clock className="h-3 w-3" />{fmtDate(lead.followUpAt)}
                          </p>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-slate-400">{fullName(lead.owner)}</span>
                          {nextStage && canWrite && (
                            <Button size="sm" variant="outline"
                              className="h-6 px-2 text-[10px]"
                              disabled={busyId === lead.id}
                              onClick={(e) => { e.stopPropagation(); completeStage(lead); }}>
                              {busyId === lead.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <><ChevronRight className="h-3 w-3" />{stageLabel(nextStage)}</>}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {stageleads.length === 0 && (
                      <div className="rounded-lg border border-dashed p-4 text-center text-xs text-slate-400">Empty</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Conversions ── */}
      {section === "conversions" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Conversion Queue ({convertibleLeads.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {convertibleLeads.length === 0
              ? <p className="text-sm text-slate-400">No leads ready for conversion.</p>
              : convertibleLeads.map((lead) => (
                <div key={lead.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => openDetail(lead)}>
                    <p className="truncate text-sm font-semibold text-slate-900">{lead.title}</p>
                    <p className="text-xs text-slate-500">{lead.companyName} · {lead.contactName || lead.email || "No contact"}</p>
                    <div className="mt-1 flex gap-2 text-xs text-slate-500">
                      <Badge className={cn("text-xs border font-normal", STAGE_COLORS[lead.stage] ?? STAGE_COLORS.new)}>{lead.stageLabel}</Badge>
                      <span>Owner: {fullName(lead.owner)}</span>
                    </div>
                  </div>
                  <Button size="sm" className="ml-3 bg-[#FE0000] text-white hover:bg-[#d90000] shrink-0"
                    disabled={!canWrite || busyId === lead.id} onClick={() => convertLead(lead)}>
                    {busyId === lead.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Convert
                  </Button>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* ── Reports ── */}
      {section === "reports" && (
        <div className="space-y-4">
          {loadingReports && <p className="text-sm text-slate-500">Loading reports...</p>}
          {reports && (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Stage dist */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Stage Distribution</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {reports.stageBreakdown.map((s) => (
                      <div key={s.stage}>
                        <div className="mb-1 flex justify-between text-xs text-slate-600">
                          <span>{s.label}</span><span>{s.count} ({s.share.toFixed(1)}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-[#FE0000] transition-all" style={{ width: `${s.share}%` }} />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Source dist */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Source Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <DonutChart data={reports.sourceBreakdown.map((s) => ({ label: s.source, count: s.count }))} colors={SOURCE_COLORS} />
                  </CardContent>
                </Card>

                {/* Monthly trend */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monthly Trend</CardTitle></CardHeader>
                  <CardContent>
                    <MonthlyBarChart stats={reports.monthlyStats} />
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Owner performance */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Owner Performance</CardTitle></CardHeader>
                  <CardContent>
                    <table className="w-full text-xs">
                      <thead><tr className="border-b text-slate-500">
                        <th className="pb-1.5 text-left">Owner</th>
                        <th className="pb-1.5 text-right">Total</th>
                        <th className="pb-1.5 text-right">Won</th>
                        <th className="pb-1.5 text-right">Win %</th>
                      </tr></thead>
                      <tbody>
                        {reports.ownerBreakdown.map((o) => (
                          <tr key={o.ownerId ?? "unassigned"} className="border-b last:border-0">
                            <td className="py-1.5 font-medium text-slate-800">{o.name}</td>
                            <td className="py-1.5 text-right text-slate-600">{o.total}</td>
                            <td className="py-1.5 text-right text-emerald-700">{o.won}</td>
                            <td className="py-1.5 text-right font-semibold">{o.conversionRate.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* Recent won */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500" />Recent Won
                  </CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {reports.recentWon.map((l) => (
                      <div key={l.id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">{l.title}</p>
                          <p className="text-slate-500 truncate">{l.companyName} · {l.owner}</p>
                        </div>
                        <span className="ml-2 shrink-0 text-slate-400">{fmtDate(l.updatedAt)}</span>
                      </div>
                    ))}
                    {reports.recentWon.length === 0 && <p className="text-xs text-slate-400">No won leads yet.</p>}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Create Lead Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Lead Title *</Label>
                <Input value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} placeholder="Potential onboarding..." />
              </div>
              <div className="space-y-1.5">
                <Label>Company *</Label>
                <Input value={createForm.companyName} onChange={(e) => setCreateForm((f) => ({ ...f, companyName: e.target.value }))} placeholder="Acme Corp" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact Name</Label>
                <Input value={createForm.contactName} onChange={(e) => setCreateForm((f) => ({ ...f, contactName: e.target.value }))} placeholder="Jane Doe" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={createForm.phone} onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input value={createForm.country} onChange={(e) => setCreateForm((f) => ({ ...f, country: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Input value={createForm.source} onChange={(e) => setCreateForm((f) => ({ ...f, source: e.target.value }))}
                  list="create-source-opts" placeholder="Website / Referral..." />
                <datalist id="create-source-opts">
                  {sourceOptions.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={createForm.priority} onValueChange={(v) => v && setCreateForm((f) => ({ ...f, priority: v as "low" | "normal" | "high" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Select
                value={(createForm.ownerId || (canManage ? "unassigned" : currentUserId)) || "unassigned"}
                onValueChange={(v) => v && setCreateForm((f) => ({ ...f, ownerId: v === "unassigned" ? "" : v }))}
                disabled={!canManage}
              >
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {owners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {(owner.fullname || owner.name).trim() || owner.email || owner.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Expected Value ($)</Label>
              <Input type="number" value={createForm.expectedDeposit}
                onChange={(e) => setCreateForm((f) => ({ ...f, expectedDeposit: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={createForm.notes} onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
            {/* Custom fields */}
            {customFields.filter((cf) => cf.enabled).sort((a, b) => a.order - b.order).map((cf) => (
              <div key={cf.id} className="space-y-1.5">
                {cf.type !== "checkbox" && <Label>{cf.label}{cf.required && " *"}</Label>}
                <CustomFieldInput
                  field={cf}
                  value={createForm.customData[cf.id]}
                  onChange={(val) => setCreateForm((f) => ({ ...f, customData: { ...f.customData, [cf.id]: val } }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button className="bg-[#FE0000] text-white hover:bg-[#d90000]" onClick={createLead} disabled={creating}>
              {creating ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Creating...</> : <><Plus className="mr-1.5 h-4 w-4" />Create Lead</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Loading overlay for detail ── */}
      {loadingDetail && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] items-center justify-center border-l bg-white shadow-2xl">
          <Loader2 className="h-8 w-8 animate-spin text-[#FE0000]" />
        </div>
      )}

      {/* ── Lead Detail Sheet ── */}
      {selectedDetail && !loadingDetail && (
        <LeadDetailSheet
          lead={selectedDetail}
          stageFlow={stageFlow}
          sourceOptions={sourceOptions}
          customFields={customFields}
          owners={owners}
          currentUserId={currentUserId}
          canWrite={canWrite}
          canManage={canManage}
          onClose={() => setSelectedDetail(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onConverted={() => { setSelectedDetail(null); void loadLeads(); }}
        />
      )}
    </div>
  );
}
