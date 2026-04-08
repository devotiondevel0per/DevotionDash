"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { ArrowLeft, Bot, FolderPlus, Loader2, Lock, MessageSquare, Pin, Plus, RefreshCw, Search, Sparkles, Trash2, Users } from "lucide-react";

type BoardCategory = { id: string; name: string; color: string; _count: { topics: number } };
type Topic = {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
  isPinned: boolean;
  isLocked: boolean;
  isResolved: boolean;
  createdAt: string;
  lastActivityAt: string;
  category: { id: string; name: string; color: string } | null;
  creator: { id: string; name: string; fullname: string } | null;
  team: { id: string; name: string } | null;
  organization: { id: string; name: string } | null;
  _count: { posts: number };
};
type Post = { id: string; content: string; createdAt: string; updatedAt: string; author: { id: string; name: string; fullname: string; photoUrl: string | null } | null };
type TopicDetail = Topic & { posts: Post[] };
type BoardMeta = {
  teams: Array<{ id: string; name: string; color: string }>;
  organizations: Array<{ id: string; name: string; type: string; status: string }>;
  visibilityOptions: Array<{ value: string; label: string }>;
};
type BoardSummary = {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
  unansweredQuestions: string[];
  participants: string[];
  tone: "positive" | "neutral" | "negative" | "mixed";
  generatedAt: string;
};

const AVATAR_COLORS = ["bg-[#AA8038]/10 text-[#AA8038]", "bg-blue-100 text-blue-700", "bg-green-100 text-green-700", "bg-orange-100 text-orange-700"];

function nameOf(user: { name: string; fullname: string } | null) { return user ? (user.fullname || user.name) : "Unknown"; }
function initials(name: string) { return name.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(); }
function colorFor(name: string) { let h = 0; for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
function rel(iso: string) { const d = Date.now() - new Date(iso).getTime(); const m = Math.floor(d / 60000); if (m < 1) return "now"; if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`; }
function fmt(iso: string) { return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function visLabel(v: string) { if (v === "team") return "Team"; if (v === "private") return "Private"; if (v === "public") return "Public"; return "Organization"; }

function TopicDetailView({ topicId, userId, canWrite, canManage, onBack, onDeleted, onUpdated }: {
  topicId: string; userId: string; canWrite: boolean; canManage: boolean; onBack: () => void; onDeleted: (id: string) => void; onUpdated: (t: Topic) => void;
}) {
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);
  const [summary, setSummary] = useState<BoardSummary | null>(null);
  const [sumLoading, setSumLoading] = useState(false);
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch(`/api/board/${topicId}`, { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<TopicDetail>; })
      .then((data) => { if (mounted) setTopic(data); })
      .catch(() => toast.error("Failed to load topic"))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [topicId]);

  async function patchTopic(payload: Record<string, unknown>) {
    if (!topic) return;
    const r = await fetch(`/api/board/${topic.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await r.json() as Topic | { error?: string };
    if (!r.ok) { toast.error((data as { error?: string }).error ?? "Update failed"); return; }
    const next = data as Topic;
    setTopic((prev) => prev ? { ...prev, ...next } : prev);
    onUpdated(next);
  }

  async function postReply() {
    if (!topic || !reply.trim()) return;
    setPosting(true);
    try {
      const r = await fetch(`/api/board/${topic.id}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: reply.trim() }) });
      const data = await r.json() as Post | { error?: string };
      if (!r.ok) { toast.error((data as { error?: string }).error ?? "Reply failed"); return; }
      const p = data as Post;
      setTopic((prev) => prev ? { ...prev, posts: [...prev.posts, p], _count: { posts: prev._count.posts + 1 }, lastActivityAt: new Date().toISOString() } : prev);
      setReply("");
      setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 30);
    } finally { setPosting(false); }
  }

  async function generateSummary() {
    if (!topic) return;
    setSumLoading(true);
    try {
      const r = await fetch(`/api/board/${topic.id}/summary`, { method: "POST" });
      if (!r.ok) throw new Error();
      setSummary(await r.json() as BoardSummary);
    } catch { toast.error("Failed to summarize topic"); }
    finally { setSumLoading(false); }
  }

  if (loading) return <div className="flex-1 space-y-3 p-6">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>;
  if (!topic) return <div className="flex flex-1 items-center justify-center text-sm text-gray-400">Topic not found</div>;

  const isCreator = topic.creator?.id === userId;
  const canChange = canManage || isCreator;
  const blocked = topic.isLocked && !canManage && !isCreator;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#f8f9fc]">
      <div className="border-b bg-white px-6 py-4">
        <button onClick={onBack} className="mb-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><ArrowLeft className="h-3.5 w-3.5" />Back</button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-gray-900">{topic.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="outline" className="border-transparent" style={{ backgroundColor: `${topic.category?.color ?? "#AA8038"}1A`, color: topic.category?.color ?? "#AA8038" }}>{topic.category?.name ?? "General"}</Badge>
              <Badge variant="outline">{visLabel(topic.visibility)}</Badge>
              <Badge variant="outline" className={topic.isResolved ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}>{topic.isResolved ? "Resolved" : "Open"}</Badge>
              {topic.isLocked ? <Badge variant="outline" className="bg-slate-100 text-slate-700">Locked</Badge> : null}
              <Badge variant="outline"><MessageSquare className="mr-1 h-3 w-3" />{topic._count.posts}</Badge>
            </div>
            <div className="mt-2 text-xs text-gray-500">by <span className="font-medium text-gray-700">{nameOf(topic.creator)}</span> · {fmt(topic.createdAt)} · last {rel(topic.lastActivityAt)} ago</div>
            {topic.description ? <p className="mt-2 max-w-3xl rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-700">{topic.description}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => void generateSummary()}><Bot className="mr-1.5 h-3.5 w-3.5" />Summary</Button>
            {canChange ? <Button size="sm" variant="outline" onClick={() => void patchTopic({ isResolved: !topic.isResolved })}>{topic.isResolved ? "Reopen" : "Resolve"}</Button> : null}
            {canManage ? <Button size="sm" variant="outline" onClick={() => void patchTopic({ isLocked: !topic.isLocked })}><Lock className="mr-1.5 h-3.5 w-3.5" />{topic.isLocked ? "Unlock" : "Lock"}</Button> : null}
            {canManage ? <Button size="sm" variant="outline" onClick={() => void patchTopic({ isPinned: !topic.isPinned })}><Pin className="mr-1.5 h-3.5 w-3.5" />{topic.isPinned ? "Unpin" : "Pin"}</Button> : null}
            {canChange ? <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => { void (async () => { const r = await fetch(`/api/board/${topic.id}`, { method: "DELETE" }); if (!r.ok) { toast.error("Delete failed"); return; } toast.success("Topic deleted"); onDeleted(topic.id); onBack(); })(); }}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete</Button> : null}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {sumLoading ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
        {summary ? (
          <div className="rounded-xl border border-red-100 bg-red-50/40 p-4 text-sm text-gray-700">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#B07200]"><Sparkles className="h-4 w-4" />AI Summary</div>
            <p>{summary.summary}</p>
            {summary.keyPoints.length > 0 ? <ul className="mt-2 list-disc space-y-1 pl-5">{summary.keyPoints.map((k, i) => <li key={`${k}-${i}`}>{k}</li>)}</ul> : null}
          </div>
        ) : null}

        {topic.posts.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white py-12 text-center text-sm text-gray-500">No replies yet.</div>
        ) : (
          topic.posts.map((post, idx) => {
            const owner = nameOf(post.author);
            return (
              <div key={post.id} className="flex gap-3">
                <Avatar className="mt-0.5 h-8 w-8"><AvatarFallback className={cn("text-xs font-semibold", colorFor(owner))}>{initials(owner)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2 text-xs text-gray-500"><span className="font-semibold text-gray-800">{owner}</span><span>{fmt(post.createdAt)}</span><span>#{idx + 1}</span></div>
                  <div className="rounded-xl border bg-white px-4 py-3 text-sm text-gray-700"><p className="whitespace-pre-line">{post.content}</p></div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>

      {canWrite ? (
        <div className="border-t bg-white px-6 py-4">
          <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} disabled={blocked || posting} placeholder={blocked ? "Topic is locked" : "Write a reply..."} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void postReply(); }} />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-500">{blocked ? "Only managers can reply" : "Ctrl+Enter to send"}</span>
            <Button onClick={() => void postReply()} disabled={blocked || posting || !reply.trim()} className="bg-[#AA8038] text-white hover:bg-[#D78C00]">{posting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}Post Reply</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function BoardPage() {
  const { can, access } = usePermissions();
  const canWrite = can("board", "write");
  const canManage = can("board", "manage");
  const userId = access?.userId ?? "";

  const [topics, setTopics] = useState<Topic[]>([]);
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [meta, setMeta] = useState<BoardMeta>({ teams: [], organizations: [], visibilityOptions: [{ value: "organization", label: "Organization" }, { value: "team", label: "Team" }, { value: "private", label: "Private" }, { value: "public", label: "Public" }] });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [sort, setSort] = useState("recent");
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newVisibility, setNewVisibility] = useState("organization");
  const [newTeamId, setNewTeamId] = useState("none");
  const [newOrgId, setNewOrgId] = useState("none");
  const [newPinned, setNewPinned] = useState(false);

  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState("#AA8038");
  const [catDescription, setCatDescription] = useState("");

  const stats = useMemo(() => ({
    total: topics.length,
    open: topics.filter((t) => !t.isResolved).length,
    resolved: topics.filter((t) => t.isResolved).length,
    teamScoped: topics.filter((t) => t.visibility === "team").length,
  }), [topics]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [topicsRes, catsRes, metaRes] = await Promise.all([
      fetch(`/api/board?${new URLSearchParams({ limit: "300", sort, ...(activeCategory !== "all" ? { categoryId: activeCategory } : {}), ...(search.trim() ? { search: search.trim() } : {}), ...(status !== "all" ? { status } : {}), ...(visibility !== "all" ? { visibility } : {}), ...(mineOnly ? { mine: "1" } : {}) }).toString()}`, { cache: "no-store" }),
      fetch("/api/board/categories", { cache: "no-store" }),
      fetch("/api/board/meta", { cache: "no-store" }),
    ]);

    try {
      if (!topicsRes.ok || !catsRes.ok) throw new Error("load-failed");
      const topicsData = await topicsRes.json() as Topic[];
      const catsData = await catsRes.json() as BoardCategory[];
      setTopics(Array.isArray(topicsData) ? topicsData : []);
      setCategories(Array.isArray(catsData) ? catsData : []);
      if (metaRes.ok) {
        const metaData = await metaRes.json() as BoardMeta;
        setMeta(metaData);
      }
    } catch {
      toast.error("Failed to load board");
    } finally {
      setLoading(false);
    }
  }, [activeCategory, mineOnly, search, sort, status, visibility]);

  useEffect(() => {
    const t = setTimeout(() => { void refresh(); }, 180);
    return () => clearTimeout(t);
  }, [refresh]);

  const pinned = topics.filter((t) => t.isPinned);
  const regular = topics.filter((t) => !t.isPinned);

  async function createTopic() {
    if (!newTitle.trim() || !newCategoryId) return;
    setCreating(true);
    try {
      const r = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          categoryId: newCategoryId,
          visibility: newVisibility,
          teamId: newVisibility === "team" && newTeamId !== "none" ? newTeamId : null,
          organizationId: newVisibility === "organization" && newOrgId !== "none" ? newOrgId : null,
          isPinned: newPinned,
        }),
      });
      const data = await r.json() as Topic | { error?: string };
      if (!r.ok) { toast.error((data as { error?: string }).error ?? "Failed to create topic"); return; }
      const created = data as Topic;
      if (newBody.trim()) {
        await fetch(`/api/board/${created.id}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: newBody.trim() }) });
      }
      setCreateOpen(false);
      setNewTitle(""); setNewDescription(""); setNewBody("");
      toast.success("Topic created");
      await refresh();
      setSelectedTopicId(created.id);
    } finally { setCreating(false); }
  }

  async function createCategory() {
    if (!catName.trim()) return;
    const r = await fetch("/api/board/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: catName.trim(), color: catColor, description: catDescription.trim() }),
    });
    const data = await r.json() as { error?: string };
    if (!r.ok) { toast.error(data.error ?? "Failed to create category"); return; }
    setCategoryOpen(false);
    setCatName(""); setCatDescription("");
    toast.success("Category created");
    await refresh();
  }

  if (selectedTopicId) {
    return <TopicDetailView topicId={selectedTopicId} userId={userId} canWrite={canWrite} canManage={canManage} onBack={() => setSelectedTopicId(null)} onDeleted={(id) => setTopics((prev) => prev.filter((t) => t.id !== id))} onUpdated={(topic) => setTopics((prev) => prev.map((t) => t.id === topic.id ? { ...t, ...topic } : t))} />;
  }

  return (
    <div className="flex h-full bg-[#f7f8fc]">
      <aside className="hidden w-64 shrink-0 border-r bg-white md:flex md:flex-col">
        <div className="border-b px-4 py-4">
          <div className="flex items-center justify-between">
            <div><h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">Board</h2><p className="text-xs text-gray-500">Conversations</p></div>
            {canManage ? <button onClick={() => setCategoryOpen(true)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-[#AA8038]"><FolderPlus className="h-4 w-4" /></button> : null}
          </div>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {[{ id: "all", name: "All Topics", color: "#AA8038", _count: { topics: topics.length } }, ...categories].map((c) => (
            <button key={c.id} onClick={() => setActiveCategory(c.id)} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm", activeCategory === c.id ? "bg-red-50 text-[#AA8038]" : "text-gray-600 hover:bg-gray-100")}>
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color || "#AA8038" }} />{c.name}</span>
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{c._count.topics}</span>
            </button>
          ))}
        </div>
        <div className="border-t p-3 text-xs text-gray-500"><div className="mb-1 flex items-center gap-2"><Users className="h-3.5 w-3.5" />Role / Team / Org aware</div><p>Board visibility follows permissions and team scope.</p></div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b bg-white px-6 py-5">
          <div className="rounded-2xl bg-gradient-to-r from-[#AA8038] via-[#D58A00] to-[#8C5B00] p-5 text-white shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h1 className="text-2xl font-semibold">Board Command Center</h1><p className="mt-1 text-sm text-red-100">Structured discussions with on-demand AI summary.</p></div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => void refresh()}><RefreshCw className="mr-1.5 h-4 w-4" />Refresh</Button>
                {canWrite ? <Button className="bg-white text-[#B47500] hover:bg-red-50" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" />New Topic</Button> : null}
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-white/20 bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-red-100">Total</p><p className="text-xl font-semibold">{stats.total}</p></div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-red-100">Open</p><p className="text-xl font-semibold">{stats.open}</p></div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-red-100">Resolved</p><p className="text-xl font-semibold">{stats.resolved}</p></div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-red-100">Team Scoped</p><p className="text-xl font-semibold">{stats.teamScoped}</p></div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
            <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search topics" className="h-9 pl-8" /></div>
            <Select value={status} onValueChange={(value) => setStatus(value ?? "all")}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="resolved">Resolved</SelectItem></SelectContent></Select>
            <Select value={visibility} onValueChange={(value) => setVisibility(value ?? "all")}><SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All visibility</SelectItem><SelectItem value="organization">Organization</SelectItem><SelectItem value="team">Team</SelectItem><SelectItem value="private">Private</SelectItem><SelectItem value="public">Public</SelectItem></SelectContent></Select>
            <Select value={sort} onValueChange={(value) => setSort(value ?? "recent")}><SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recent">Latest activity</SelectItem><SelectItem value="most_replies">Most replies</SelectItem><SelectItem value="oldest">Oldest first</SelectItem></SelectContent></Select>
            <Button variant={mineOnly ? "default" : "outline"} onClick={() => setMineOnly((m) => !m)} className={mineOnly ? "h-9 bg-[#AA8038] text-white hover:bg-[#D78C00]" : "h-9"}><Users className="mr-1.5 h-4 w-4" />My Topics</Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div> : (
            topics.length === 0 ? <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center text-gray-500">No discussions matched your filters.</div> :
            <div className="space-y-2">
              {pinned.length > 0 ? <div className="mb-1 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500"><Pin className="h-3.5 w-3.5 text-orange-500" />Pinned</div> : null}
              {pinned.map((t) => (
                <button key={t.id} onClick={() => setSelectedTopicId(t.id)} className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-[#AA8038]/30 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-gray-900">{t.title}</h3><p className="mt-1 line-clamp-2 text-xs text-gray-500">{t.description || "No summary"}</p></div><div className="text-xs text-gray-400">{rel(t.lastActivityAt)} ago</div></div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs"><Badge variant="outline" className="border-transparent" style={{ backgroundColor: `${t.category?.color ?? "#AA8038"}1A`, color: t.category?.color ?? "#AA8038" }}>{t.category?.name ?? "General"}</Badge><Badge variant="outline">{visLabel(t.visibility)}</Badge><Badge variant="outline" className={t.isResolved ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}>{t.isResolved ? "Resolved" : "Open"}</Badge><Badge variant="outline"><MessageSquare className="mr-1 h-3 w-3" />{t._count.posts}</Badge></div>
                </button>
              ))}
              {regular.map((t) => (
                <button key={t.id} onClick={() => setSelectedTopicId(t.id)} className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-[#AA8038]/30 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-gray-900">{t.title}</h3><p className="mt-1 line-clamp-2 text-xs text-gray-500">{t.description || "No summary"}</p></div><div className="text-xs text-gray-400">{rel(t.lastActivityAt)} ago</div></div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs"><Badge variant="outline" className="border-transparent" style={{ backgroundColor: `${t.category?.color ?? "#AA8038"}1A`, color: t.category?.color ?? "#AA8038" }}>{t.category?.name ?? "General"}</Badge><Badge variant="outline">{visLabel(t.visibility)}</Badge><Badge variant="outline" className={t.isResolved ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}>{t.isResolved ? "Resolved" : "Open"}</Badge><Badge variant="outline"><MessageSquare className="mr-1 h-3 w-3" />{t._count.posts}</Badge></div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Create Topic</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Title</Label><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Summary</Label><Textarea rows={3} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Category</Label><Select value={newCategoryId} onValueChange={(value) => setNewCategoryId(value ?? "")} items={Object.fromEntries(categories.map((c) => [c.id, c.name]))}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Visibility</Label><Select value={newVisibility} onValueChange={(value) => setNewVisibility(value ?? "organization")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{meta.visibilityOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            {newVisibility === "team" ? <div className="space-y-1.5"><Label>Team</Label><Select value={newTeamId} onValueChange={(value) => setNewTeamId(value ?? "none")} items={{ "none": "None", ...Object.fromEntries(meta.teams.map((t) => [t.id, t.name])) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{meta.teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div> : null}
            {newVisibility === "organization" ? <div className="space-y-1.5"><Label>Organization</Label><Select value={newOrgId} onValueChange={(value) => setNewOrgId(value ?? "none")} items={{ "none": "General", ...Object.fromEntries(meta.organizations.map((o) => [o.id, o.name])) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">General</SelectItem>{meta.organizations.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div> : null}
            {canManage ? <label className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={newPinned} onChange={(e) => setNewPinned(e.target.checked)} className="h-4 w-4" />Pin topic</label> : null}
            <div className="space-y-1.5 sm:col-span-2"><Label>Opening Message</Label><Textarea rows={6} value={newBody} onChange={(e) => setNewBody(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button className="bg-[#AA8038] text-white hover:bg-[#D78C00]" disabled={creating || !newTitle.trim() || !newCategoryId} onClick={() => void createTopic()}>{creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create Category</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={catName} onChange={(e) => setCatName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Color</Label><div className="flex items-center gap-2"><Input type="color" value={catColor} onChange={(e) => setCatColor(e.target.value)} className="h-10 w-14 p-1" /><Input value={catColor} onChange={(e) => setCatColor(e.target.value)} /></div></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={3} value={catDescription} onChange={(e) => setCatDescription(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryOpen(false)}>Cancel</Button>
            <Button className="bg-[#AA8038] text-white hover:bg-[#D78C00]" onClick={() => void createCategory()} disabled={!catName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

