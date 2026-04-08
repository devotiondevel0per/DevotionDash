"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/hooks/use-permissions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { HomeAiInsightData, HomeDashboardData } from "@/types/home";
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  Building2,
  Calendar,
  CheckSquare,
  ChevronRight,
  Clock3,
  FileText,
  Headphones,
  Inbox,
  Mail,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  normal: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

const taskStatusColors: Record<string, string> = {
  opened: "bg-primary/10 text-primary",
  completed: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

const requestStatusColors: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  pending: "bg-amber-100 text-amber-700",
  closed: "bg-gray-100 text-gray-600",
};

const severityClass: Record<"high" | "medium" | "low", string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-sky-100 text-sky-700",
};

function MiniDonutChart({ segments, size = 72 }: {
  segments: Array<{ value: number; color: string; label: string }>;
  size?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) {
    return (
      <div style={{ width: size, height: size }} className="flex items-center justify-center rounded-full border-4 border-gray-100">
        <span className="text-[10px] text-gray-400">No data</span>
      </div>
    );
  }
  const r = (size - 12) / 2;
  const cx = size / 2;
  const cy = size / 2;
  let cumAngle = -Math.PI / 2;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((seg) => {
      const angle = (seg.value / total) * 2 * Math.PI;
      const x1 = cx + r * Math.cos(cumAngle);
      const y1 = cy + r * Math.sin(cumAngle);
      cumAngle += angle;
      const x2 = cx + r * Math.cos(cumAngle);
      const y2 = cy + r * Math.sin(cumAngle);
      const large = angle > Math.PI ? 1 : 0;
      return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`, color: seg.color };
    });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {arcs.map((arc, i) => <path key={i} d={arc.d} fill={arc.color} />)}
      <circle cx={cx} cy={cy} r={r * 0.62} fill="white" />
    </svg>
  );
}

function MiniBarChart({ bars, height = 48 }: {
  bars: Array<{ label: string; value: number; color: string }>;
  height?: number;
}) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {bars.map((bar) => (
        <div key={bar.label} className="flex flex-1 flex-col items-center gap-0.5">
          <span className="text-[10px] font-medium text-gray-700">{bar.value}</span>
          <div
            className="w-full rounded-t transition-all"
            style={{ height: `${Math.max(4, (bar.value / max) * (height - 16))}px`, backgroundColor: bar.color }}
          />
          <span className="text-[9px] text-gray-400 truncate w-full text-center">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

const statCards = [
  { key: "activeTasks" as const, label: "Active Tasks", icon: CheckSquare, href: "/tasks", className: "bg-primary/10 text-primary" },
  { key: "openRequests" as const, label: "Open Requests", icon: Headphones, href: "/servicedesk", className: "bg-orange-50 text-orange-600" },
  { key: "unreadEmails" as const, label: "Unread Emails", icon: Inbox, href: "/email", className: "bg-purple-50 text-purple-600" },
  { key: "todayEvents" as const, label: "Today Events", icon: Calendar, href: "/calendar", className: "bg-green-50 text-green-600" },
];

export default function HomePage() {
  const { data: session } = useSession();
  const { can } = usePermissions();
  const [data, setData] = useState<HomeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [insights, setInsights] = useState<HomeAiInsightData | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsRefreshing, setInsightsRefreshing] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/home/stats");
      if (!response.ok) throw new Error("Failed to load dashboard data");
      setData((await response.json()) as HomeDashboardData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const loadInsights = async (manual = false) => {
    try {
      if (manual) setInsightsRefreshing(true);
      else setInsightsLoading(true);
      setInsightsError(null);
      const response = await fetch("/api/home/insights", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load AI insights");
      setInsights((await response.json()) as HomeAiInsightData);
    } catch (e) {
      setInsightsError(e instanceof Error ? e.message : "Failed to load AI insights");
    } finally {
      setInsightsLoading(false);
      setInsightsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadStats();
    void loadInsights();
  }, []);

  const taskCompletionRate = useMemo(() => {
    if (!data) return 0;
    const total = data.breakdown.tasks.opened + data.breakdown.tasks.completed + data.breakdown.tasks.closed;
    if (total === 0) return 0;
    return Math.round((data.breakdown.tasks.completed / total) * 100);
  }, [data]);

  const operationalPressure = useMemo(() => {
    if (!data) return 0;
    const pressure = data.breakdown.tasks.overdue * 10 + data.breakdown.requests.highPriorityActive * 10 + data.breakdown.emails.unreadOlderThan3Days * 8;
    return Math.min(100, pressure);
  }, [data]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Home Dashboard</h1>
            <p className="mt-0.5 text-sm text-gray-500">Detailed operational view with Qwen 2.5 7B insights.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/tasks"><Button size="sm" variant="outline"><Plus className="mr-1 h-4 w-4" />New Task</Button></Link>
            <Link href="/email"><Button size="sm" variant="outline"><Mail className="mr-1 h-4 w-4" />New Email</Button></Link>
            <Link href="/tasks"><Button size="sm" variant="outline"><FileText className="mr-1 h-4 w-4" />New Note</Button></Link>
            <Link href="/servicedesk"><Button size="sm"><Headphones className="mr-1 h-4 w-4" />New Request</Button></Link>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto bg-gray-50 p-6">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="rounded-xl border bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}{session?.user?.name ? `, ${session.user.name}` : ""}!
              </h2>
              <p className="text-sm text-gray-500">Here&apos;s what&apos;s happening today.</p>
            </div>
            {!loading && data ? (
              <div className="flex gap-6 text-center">
                <div><p className="text-2xl font-bold text-primary">{taskCompletionRate}%</p><p className="text-xs text-gray-500">Task completion</p></div>
                <div><p className="text-2xl font-bold text-gray-900">{data.breakdown.tasks.overdue}</p><p className="text-xs text-gray-500">Overdue</p></div>
                <div><p className="text-2xl font-bold text-gray-900">{data.breakdown.requests.highPriorityActive}</p><p className="text-xs text-gray-500">Urgent requests</p></div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((stat) => (
            <Link key={stat.label} href={stat.href}>
              <Card className="cursor-pointer shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("rounded-lg p-2.5", stat.className)}><stat.icon className="h-5 w-5" /></div>
                    <div>
                      {loading ? <Skeleton className="mb-1 h-7 w-10" /> : <p className="text-2xl font-bold text-gray-900">{data?.[stat.key] ?? 0}</p>}
                      <p className="text-xs text-gray-500">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Charts row */}
        {!loading && data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* Task Distribution */}
            {can("tasks", "read") ? (
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <CheckSquare className="h-4 w-4 text-primary" />Task Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4">
                    <MiniDonutChart
                      size={72}
                      segments={[
                        { label: "Opened", value: data.breakdown.tasks.opened, color: "#ef4444" },
                        { label: "Completed", value: data.breakdown.tasks.completed, color: "#22c55e" },
                        { label: "Closed", value: data.breakdown.tasks.closed, color: "#94a3b8" },
                      ]}
                    />
                    <div className="flex-1 space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />Opened</span>
                        <span className="font-semibold">{data.breakdown.tasks.opened}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />Completed</span>
                        <span className="font-semibold">{data.breakdown.tasks.completed}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />Closed</span>
                        <span className="font-semibold">{data.breakdown.tasks.closed}</span>
                      </div>
                      <div className="mt-2 pt-1 border-t text-[10px] text-gray-400">
                        {data.breakdown.tasks.overdue > 0 && <span className="text-red-500">{data.breakdown.tasks.overdue} overdue</span>}
                        {data.breakdown.tasks.overdue === 0 && <span className="text-green-600">No overdue tasks</span>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Request Priority */}
            {can("servicedesk", "read") ? (
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Headphones className="h-4 w-4 text-orange-500" />Requests by Priority
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <MiniBarChart
                    height={72}
                    bars={[
                      { label: "High", value: data.breakdown.requests.highPriorityActive, color: "#ef4444" },
                      { label: "Normal", value: data.breakdown.requests.normalPriorityActive, color: "#f59e0b" },
                      { label: "Low", value: data.breakdown.requests.lowPriorityActive, color: "#94a3b8" },
                      { label: "Pending", value: data.breakdown.requests.pending, color: "#a78bfa" },
                      { label: "Closed", value: data.breakdown.requests.closed, color: "#d1d5db" },
                    ]}
                  />
                </CardContent>
              </Card>
            ) : null}

            {/* Email Stats */}
            {can("email", "read") ? (
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Mail className="h-4 w-4 text-purple-500" />Email Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <MiniBarChart
                    height={72}
                    bars={[
                      { label: "Unread", value: data.breakdown.emails.unread, color: "#8b5cf6" },
                      { label: "Today", value: data.breakdown.emails.receivedToday, color: "#6366f1" },
                      { label: "Stale", value: data.breakdown.emails.unreadOlderThan3Days, color: "#F8C971" },
                    ]}
                  />
                </CardContent>
              </Card>
            ) : null}

            {/* Organization Breakdown */}
            {can("clients", "read") ? (
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Building2 className="h-4 w-4 text-blue-500" />Org Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-3">
                    <MiniDonutChart
                      size={60}
                      segments={[
                        { label: "Client", value: data.breakdown.organizations.client, color: "#3b82f6" },
                        { label: "Partner", value: data.breakdown.organizations.partner, color: "#22c55e" },
                        { label: "Potential", value: data.breakdown.organizations.potential, color: "#f59e0b" },
                      ]}
                    />
                    <div className="flex-1 space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />Clients</span>
                        <span className="font-semibold">{data.breakdown.organizations.client}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />Partners</span>
                        <span className="font-semibold">{data.breakdown.organizations.partner}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />Potential</span>
                        <span className="font-semibold">{data.breakdown.organizations.potential}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="border-primary/15 shadow-sm xl:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <BrainCircuit className="h-4 w-4 text-primary" />AI Daily Brief
                </CardTitle>
                <div className="flex items-center gap-2">
                  {insights?.source && <Badge variant="secondary" className="bg-primary/10 text-primary">{insights.source}</Badge>}
                  <Button size="sm" variant="outline" className="h-7" onClick={() => void loadInsights(true)} disabled={insightsLoading || insightsRefreshing}>
                    <RefreshCw className={cn("mr-1 h-3.5 w-3.5", (insightsLoading || insightsRefreshing) && "animate-spin")} />Refresh AI
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              {insightsLoading ? (
                <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-20 w-full" /></div>
              ) : insightsError ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{insightsError}</div>
              ) : insights ? (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                    <div className="space-y-1.5">
                      <p className="text-sm text-gray-700">{insights.summary}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {insights.fallback && <Badge variant="secondary" className="bg-amber-100 text-amber-700">Fallback mode</Badge>}
                        <span className="text-xs text-gray-500">Generated {new Date(insights.generatedAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="min-w-24 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-center">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-primary/80">Focus</p>
                      <p className="text-2xl font-semibold text-primary">{insights.focusScore}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500"><Sparkles className="h-3.5 w-3.5 text-primary" />Highlights</p>
                      {insights.highlights.length === 0 ? <p className="text-sm text-gray-500">No highlights.</p> : insights.highlights.map((item, idx) => (
                        <div key={`${item}-${idx}`} className="rounded-lg bg-gray-50 px-2.5 py-2 text-sm text-gray-700">{item}</div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" />Risks</p>
                      {insights.risks.length === 0 ? <p className="text-sm text-gray-500">No risks.</p> : insights.risks.map((risk, idx) => (
                        <Link key={`${risk.title}-${idx}`} href={risk.href} className="block rounded-lg border border-gray-200 bg-white px-2.5 py-2 hover:border-primary/30">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-gray-800">{risk.title}</p>
                            <Badge className={severityClass[risk.severity]} variant="secondary">{risk.severity}</Badge>
                          </div>
                          <p className="text-xs text-gray-500">{risk.reason}</p>
                        </Link>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500"><Bot className="h-3.5 w-3.5 text-primary" />Suggested Actions</p>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {insights.actions.length === 0 ? <p className="text-sm text-gray-500">No actions.</p> : insights.actions.map((action, idx) => (
                        <Link key={`${action.title}-${idx}`} href={action.href} className="rounded-lg border border-gray-200 bg-white px-3 py-2 hover:border-primary/30">
                          <p className="text-sm font-medium text-gray-800">{action.title}</p>
                          <p className="mt-0.5 text-xs text-gray-500">{action.description}</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">No AI data available.</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base font-semibold"><Clock3 className="h-4 w-4 text-primary" />Operations Pulse</CardTitle></CardHeader>
            <CardContent className="space-y-4 pt-0">
              {loading || !data ? (
                <><Skeleton className="h-4 w-full" /><Skeleton className="h-2 w-full" /><Skeleton className="h-14 w-full" /></>
              ) : (
                <>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm"><span className="text-gray-600">Task completion</span><span className="font-semibold text-gray-900">{taskCompletionRate}%</span></div>
                    <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(8, taskCompletionRate)}%` }} /></div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm"><span className="text-gray-600">Operational pressure</span><span className="font-semibold text-gray-900">{operationalPressure}%</span></div>
                    <div className="h-2 rounded-full bg-gray-100"><div className={cn("h-2 rounded-full", operationalPressure >= 65 ? "bg-red-500" : operationalPressure >= 35 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.max(8, operationalPressure)}%` }} /></div>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center justify-between"><span className="text-gray-600">Overdue tasks</span><span className="font-medium text-gray-900">{data.breakdown.tasks.overdue}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-600">High-priority requests</span><span className="font-medium text-gray-900">{data.breakdown.requests.highPriorityActive}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-600">Stale unread emails</span><span className="font-medium text-gray-900">{data.breakdown.emails.unreadOlderThan3Days}</span></div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-100 space-y-1 text-sm">
                    <p className="text-xs font-medium text-gray-500 mb-1">Task Priority Open</p>
                    <div className="flex items-center justify-between"><span className="text-gray-600">High</span><span className="font-medium text-red-600">{data.breakdown.tasks.highPriorityOpen}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-600">Normal</span><span className="font-medium text-amber-600">{data.breakdown.tasks.normalPriorityOpen}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-600">Low</span><span className="font-medium text-gray-600">{data.breakdown.tasks.lowPriorityOpen}</span></div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base font-semibold"><CheckSquare className="h-4 w-4 text-primary" />Due Soon</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />) : (data?.dueSoonTasks ?? []).slice(0, 3).map((task) => (
                <div key={task.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <p className="truncate text-sm font-medium text-gray-800">{task.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{task.assignee} - {task.due}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Badge className={priorityColors[task.priority] || "bg-gray-100 text-gray-600"} variant="secondary">{task.priority}</Badge>
                    <Badge className={taskStatusColors[task.status] || "bg-gray-100 text-gray-600"} variant="secondary">{task.status}</Badge>
                  </div>
                </div>
              ))}
              {!loading && (data?.dueSoonTasks.length ?? 0) === 0 && <p className="text-sm text-gray-500">No upcoming deadlines.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base font-semibold"><Headphones className="h-4 w-4 text-primary" />Recent Requests</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />) : (data?.recentRequests ?? []).slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <p className="truncate text-sm font-medium text-gray-800">{item.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{item.assignee} - {item.updated}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Badge className={requestStatusColors[item.status] || "bg-gray-100 text-gray-600"} variant="secondary">{item.status}</Badge>
                    <Badge className={priorityColors[item.priority] || "bg-gray-100 text-gray-600"} variant="secondary">{item.priority}</Badge>
                  </div>
                </div>
              ))}
              {!loading && (data?.recentRequests.length ?? 0) === 0 && <p className="text-sm text-gray-500">No requests found.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base font-semibold"><Mail className="h-4 w-4 text-primary" />Recent Emails</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />) : (data?.recentEmails ?? []).slice(0, 3).map((email) => (
                <div key={email.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <p className={cn("truncate text-sm", email.unread ? "font-semibold text-gray-900" : "text-gray-700")}>{email.subject}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{email.from} - {email.date}</p>
                </div>
              ))}
              {!loading && (data?.recentEmails.length ?? 0) === 0 && <p className="text-sm text-gray-500">No emails found.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base font-semibold"><Building2 className="h-4 w-4 text-primary" />Active Organizations</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />) : (data?.activeOrganizations ?? []).slice(0, 3).map((org) => (
                <div key={org.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7"><AvatarFallback className="bg-primary/10 text-xs text-primary">{org.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{org.name}</p>
                        <p className="text-xs text-gray-500">{org.type}</p>
                      </div>
                    </div>
                    <Badge className={org.rating === "hot" ? "bg-red-100 text-red-700" : org.rating === "good" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"} variant="secondary">{org.rating}</Badge>
                  </div>
                </div>
              ))}
              {!loading && (data?.activeOrganizations.length ?? 0) === 0 && <p className="text-sm text-gray-500">No organizations found.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-end">
          <div className="flex gap-2">
            <Link href="/tasks" className="inline-flex items-center rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-primary">Tasks<ChevronRight className="ml-0.5 h-3 w-3" /></Link>
            <Link href="/servicedesk" className="inline-flex items-center rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-primary">Service Desk<ChevronRight className="ml-0.5 h-3 w-3" /></Link>
            <Link href="/calendar" className="inline-flex items-center rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-primary">Calendar<ChevronRight className="ml-0.5 h-3 w-3" /></Link>
          </div>
        </div>
      </div>
    </div>
  );
}
