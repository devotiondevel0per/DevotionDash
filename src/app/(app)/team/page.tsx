"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Mail,
  Phone,
  MessageSquare,
  Users,
  Cake,
  Clock,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  X,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AgentStatusValue = "online" | "away" | "offline";

type TeamUser = {
  id: string;
  login: string;
  email: string;
  name: string;
  surname: string;
  fullname: string;
  position: string;
  department: string;
  phoneWork: string;
  phoneMobile: string;
  photoUrl: string | null;
  workState: number | null;
  isActive: boolean;
  lastActivity: string | null;
  dateBirthday: string | null;
  createdAt: string;
  agentStatus?: AgentStatusValue | null;
};

type BirthdayItem = {
  member: TeamUser;
  isToday: boolean;
  upcoming: boolean;
  dateLabel: string;
  daysAway: number;
};

type AuditLog = {
  id: string;
  action: string;
  module: string;
  detail: string | null;
  createdAt: string;
  ip: string | null;
};

const AVATAR_COLORS = [
  "bg-primary/10 text-primary",
  "bg-purple-100 text-purple-700",
  "bg-green-100 text-green-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
  "bg-yellow-100 text-yellow-700",
];

const WORK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DEFAULT_SCHEDULE = [true, true, true, true, true, false, false];

function initialsOf(user: TeamUser): string {
  const full = user.fullname || `${user.name} ${user.surname}`.trim() || user.login;
  return full
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function fullNameOf(user: TeamUser): string {
  return user.fullname || `${user.name} ${user.surname}`.trim() || user.login;
}

function getAgentStatus(user: TeamUser): AgentStatusValue {
  if (user.agentStatus === "online" || user.agentStatus === "away") return user.agentStatus;
  if (user.agentStatus === "offline") return "offline";
  // Fallback: infer from lastActivity
  if (user.isActive && user.lastActivity) {
    const diff = Date.now() - new Date(user.lastActivity).getTime();
    if (diff < 5 * 60 * 1000) return "online";
    if (diff < 15 * 60 * 1000) return "away";
  }
  return "offline";
}

function StatusDot({ status, size = "md" }: { status: AgentStatusValue; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "h-2 w-2" : "h-3 w-3";
  const color =
    status === "online" ? "bg-green-500" : status === "away" ? "bg-amber-400" : "bg-gray-300";
  return (
    <span
      className={cn("inline-block rounded-full border-2 border-white shrink-0", sizeClass, color)}
      title={status}
    />
  );
}

function hasBirthdaySoon(user: TeamUser, withinDays = 30): BirthdayItem | null {
  if (!user.dateBirthday) return null;
  const original = new Date(user.dateBirthday);
  if (Number.isNaN(original.getTime())) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let next = new Date(now.getFullYear(), original.getMonth(), original.getDate());
  if (next < today) {
    next = new Date(now.getFullYear() + 1, original.getMonth(), original.getDate());
  }

  const daysAway = Math.floor((next.getTime() - today.getTime()) / 86400000);
  const isToday = daysAway === 0;
  const upcoming = daysAway >= 0 && daysAway <= withinDays;
  const dateLabel = next.toLocaleDateString([], { month: "long", day: "numeric" });

  return { member: user, isToday, upcoming, dateLabel, daysAway };
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(`Unable to copy ${label}`);
    }
  }
  return (
    <button
      onClick={(e) => void handleCopy(e)}
      className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      title={`Copy ${label}`}
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function MemberProfileModal({
  user,
  colorClass,
  onClose,
  onStartChat,
  creatingChat,
}: {
  user: TeamUser;
  colorClass: string;
  onClose: () => void;
  onStartChat: (user: TeamUser) => void;
  creatingChat: boolean;
}) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const status = getAgentStatus(user);
  const fullName = fullNameOf(user);
  const phone = user.phoneMobile || user.phoneWork || "";

  useEffect(() => {
    void (async () => {
      setLogsLoading(true);
      try {
        const res = await fetch(`/api/team/users/${user.id}/logs`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as AuditLog[];
        setLogs(Array.isArray(data) ? data : []);
      } catch {
        setLogs([]);
      } finally {
        setLogsLoading(false);
      }
    })();
  }, [user.id]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-3">
            <div className="relative shrink-0">
              <Avatar className="h-11 w-11">
                <AvatarFallback className={cn("text-sm font-semibold", colorClass)}>{initialsOf(user)}</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0">
                <StatusDot status={status} size="sm" />
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{fullName}</p>
              <p className="truncate text-xs font-normal text-gray-500">{user.position || "No position"}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-gray-50 p-3 text-sm">
            <div className="min-w-0">
              <p className="text-xs text-gray-400">Department</p>
              <p className="truncate font-medium text-gray-800">{user.department || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Status</p>
              <div className="flex items-center gap-1.5">
                <StatusDot status={status} />
                <span className={cn("capitalize font-medium",
                  status === "online" ? "text-green-700" : status === "away" ? "text-amber-700" : "text-gray-500"
                )}>{status}</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400">Email</p>
              <div className="flex items-center gap-1 min-w-0">
                <p className="truncate font-medium text-gray-800 text-xs">{user.email || "—"}</p>
                {user.email ? <CopyButton value={user.email} label="email" /> : null}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400">Phone</p>
              <div className="flex items-center gap-1">
                <p className="font-medium text-gray-800">{phone || "—"}</p>
                {phone ? <CopyButton value={phone} label="phone" /> : null}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400">Last Activity</p>
              <p className="font-medium text-gray-800 text-xs">
                {user.lastActivity
                  ? new Date(user.lastActivity).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                  : "Never"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Member Since</p>
              <p className="font-medium text-gray-800">
                {new Date(user.createdAt).toLocaleDateString([], { month: "short", year: "numeric" })}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => { window.location.href = `mailto:${user.email}`; }}>
              <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
            </Button>
            <Button variant="outline" size="sm" className="flex-1" disabled={creatingChat} onClick={() => onStartChat(user)}>
              {creatingChat ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="mr-1.5 h-3.5 w-3.5" />} Chat
            </Button>
          </div>

          {/* Activity Logs */}
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-gray-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recent Activity</p>
            </div>
            {logsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : logs.length === 0 ? (
              <p className="rounded-lg border border-dashed py-4 text-center text-xs text-gray-400">No activity logs available</p>
            ) : (
              <div className="space-y-1 rounded-lg border bg-gray-50 p-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 rounded px-2 py-1.5 hover:bg-white text-xs">
                    <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 font-medium text-slate-600 uppercase text-[10px]">{log.module}</span>
                    <span className="flex-1 min-w-0 break-words text-gray-700">{log.action}{log.detail ? ` — ${log.detail}` : ""}</span>
                    <span className="shrink-0 text-gray-400">
                      {new Date(log.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeCard({
  employee,
  colorClass,
  creatingChat,
  onStartChat,
  onViewProfile,
}: {
  employee: TeamUser;
  colorClass: string;
  creatingChat: boolean;
  onStartChat: (user: TeamUser) => void;
  onViewProfile: (user: TeamUser) => void;
}) {
  const fullName = fullNameOf(employee);
  const status = getAgentStatus(employee);
  const phone = employee.phoneMobile || employee.phoneWork || "";
  const birthday = hasBirthdaySoon(employee, 30);
  const hasBirthdayFlag = Boolean(birthday?.upcoming);

  return (
    <Card
      className="group cursor-pointer transition-all duration-150 hover:shadow-md"
      onClick={() => onViewProfile(employee)}
    >
      <CardContent className="p-5">
        <div className="mb-3 flex items-start gap-3">
          <div className="relative shrink-0">
            <Avatar className="h-14 w-14">
              <AvatarFallback className={cn("text-lg font-semibold", colorClass)}>{initialsOf(employee)}</AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0">
              <StatusDot status={status} />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="truncate text-sm font-semibold text-gray-900">{fullName}</h3>
              {hasBirthdayFlag ? (
                <span title="Birthday in next 30 days"><Cake className="h-3.5 w-3.5 text-amber-500" /></span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500">{employee.position || "No position"}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Badge variant="secondary" className="max-w-full truncate bg-gray-100 text-xs text-gray-600">
                {employee.department || "No department"}
              </Badge>
              <span className={cn("text-[10px] font-medium capitalize",
                status === "online" ? "text-green-600" : status === "away" ? "text-amber-600" : "text-gray-400"
              )}>{status}</span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5 border-t pt-3">
          <div className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="flex-1 truncate text-xs text-gray-600">{employee.email}</span>
            {employee.email ? <CopyButton value={employee.email} label="email" /> : null}
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="flex-1 text-xs text-gray-600">{phone || "No phone"}</span>
            {phone ? <CopyButton value={phone} label="phone" /> : null}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              if (!employee.email) { toast.error("No email address found"); return; }
              window.location.href = `mailto:${employee.email}`;
            }}
          >
            <Mail className="mr-1 h-3 w-3" /> Email
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={creatingChat}
            onClick={(e) => { e.stopPropagation(); onStartChat(employee); }}
          >
            {creatingChat ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <MessageSquare className="mr-1 h-3 w-3" />}
            Chat
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "away" | "offline">("all");
  const [creatingChatUserId, setCreatingChatUserId] = useState<string | null>(null);
  const [profileUser, setProfileUser] = useState<{ user: TeamUser; colorIdx: number } | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/team/users?limit=500", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load team users");
      const data = (await response.json()) as TeamUser[];
      setMembers(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  async function startChatWith(user: TeamUser) {
    setCreatingChatUserId(user.id);
    try {
      const response = await fetch("/api/chat/dialogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: [user.id] }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) { toast.error(data.error ?? "Unable to open chat"); return; }
      window.location.href = data.id ? `/chat?dialog=${data.id}` : "/chat";
    } catch {
      toast.error("Unable to open chat");
    } finally {
      setCreatingChatUserId(null);
    }
  }

  const departments = useMemo(() => {
    const depts = new Set<string>();
    for (const member of members) { if (member.department) depts.add(member.department); }
    return Array.from(depts).sort();
  }, [members]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return members.filter((member) => {
      const matchesDept = deptFilter === "all" || member.department === deptFilter;
      const memberStatus = getAgentStatus(member);
      const matchesStatus = statusFilter === "all" || memberStatus === statusFilter;
      const matchesSearch =
        !query ||
        fullNameOf(member).toLowerCase().includes(query) ||
        (member.position ?? "").toLowerCase().includes(query) ||
        (member.department ?? "").toLowerCase().includes(query) ||
        (member.email ?? "").toLowerCase().includes(query);
      return matchesDept && matchesStatus && matchesSearch;
    });
  }, [members, searchQuery, deptFilter, statusFilter]);

  const birthdayMembers = useMemo(() =>
    members
      .map((member) => hasBirthdaySoon(member, 30))
      .filter((item): item is BirthdayItem => Boolean(item?.upcoming))
      .sort((a, b) => a.daysAway - b.daysAway),
    [members]
  );

  const byDepartment = useMemo(() => {
    const map = new Map<string, TeamUser[]>();
    for (const member of members) {
      const department = member.department || "No Department";
      const existing = map.get(department) ?? [];
      existing.push(member);
      map.set(department, existing);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [members]);

  const statusCounts = useMemo(() => {
    let online = 0, away = 0, offline = 0;
    for (const m of members) {
      const s = getAgentStatus(m);
      if (s === "online") online++;
      else if (s === "away") away++;
      else offline++;
    }
    return { online, away, offline };
  }, [members]);

  return (
    <div className="flex h-full flex-col">
      {profileUser ? (
        <MemberProfileModal
          user={profileUser.user}
          colorClass={AVATAR_COLORS[profileUser.colorIdx % AVATAR_COLORS.length]}
          onClose={() => setProfileUser(null)}
          onStartChat={startChatWith}
          creatingChat={creatingChatUserId === profileUser.user.id}
        />
      ) : null}

      <div className="border-b bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Team</h1>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
              <span>{members.length} member{members.length !== 1 ? "s" : ""}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />{statusCounts.online} online</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />{statusCounts.away} away</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-300" />{statusCounts.offline} offline</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadMembers()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
            </Button>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-8 w-36 text-sm">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="online">🟢 Online</SelectItem>
                <SelectItem value="away">🟡 Away</SelectItem>
                <SelectItem value="offline">⚫ Offline</SelectItem>
              </SelectContent>
            </Select>

            <Select value={deptFilter} onValueChange={(value) => setDeptFilter(value ?? "all")}>
              <SelectTrigger className="h-8 w-44 text-sm">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department} value={department}>{department}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative w-60">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search team members..."
                className="h-8 pl-8 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="list" className="flex h-full flex-col">
          <div className="border-b bg-white px-6">
            <TabsList className="h-10 gap-0 rounded-none border-none bg-transparent p-0">
              {[
                { value: "list", label: "List", Icon: Users },
                { value: "structure", label: "Structure", Icon: Users },
                { value: "birthdays", label: "Birthdays", Icon: Cake },
                { value: "working-time", label: "Working Time", Icon: Clock },
              ].map(({ value, label, Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-10 rounded-none border-b-2 border-transparent px-4 text-sm text-gray-500 data-[state=active]:border-[#AA8038] data-[state=active]:bg-transparent data-[state=active]:text-[#AA8038] data-[state=active]:shadow-none"
                >
                  <Icon className="mr-1.5 h-4 w-4" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="list" className="mt-0 flex-1 overflow-y-auto bg-gray-50 p-6">
            {loading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, idx) => <Skeleton key={idx} className="h-52 rounded-xl" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                <Users className="mx-auto mb-3 h-12 w-12 opacity-25" />
                <p className="text-sm font-medium">No team members found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((member, idx) => (
                  <EmployeeCard
                    key={member.id}
                    employee={member}
                    colorClass={AVATAR_COLORS[idx % AVATAR_COLORS.length]}
                    creatingChat={creatingChatUserId === member.id}
                    onStartChat={startChatWith}
                    onViewProfile={(user) => setProfileUser({ user, colorIdx: idx })}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="structure" className="mt-0 flex-1 overflow-y-auto bg-gray-50 p-6">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-40" /><Skeleton className="h-28 w-full" />
              </div>
            ) : (
              <div className="space-y-6">
                {byDepartment.map(([department, departmentMembers]) => (
                  <div key={department}>
                    <div className="mb-3 flex items-center gap-2">
                      <div className="h-5 w-1 rounded-full" style={{ backgroundColor: "#AA8038" }} />
                      <h3 className="text-sm font-semibold text-gray-800">{department}</h3>
                      <Badge variant="secondary" className="bg-gray-100 text-xs text-gray-500">{departmentMembers.length}</Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-3 pl-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {departmentMembers.map((member, idx) => {
                        const status = getAgentStatus(member);
                        return (
                          <div
                            key={member.id}
                            className="flex cursor-pointer items-center gap-3 rounded-lg border bg-white p-3 transition-shadow hover:shadow-sm"
                            onClick={() => setProfileUser({ user: member, colorIdx: idx })}
                          >
                            <div className="relative shrink-0">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className={cn("text-sm font-semibold", AVATAR_COLORS[idx % AVATAR_COLORS.length])}>
                                  {initialsOf(member)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="absolute bottom-0 right-0"><StatusDot status={status} size="sm" /></span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900">{fullNameOf(member)}</p>
                              <p className="truncate text-xs text-gray-500">{member.position || "No position"}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {byDepartment.length === 0 ? (
                  <div className="py-20 text-center text-gray-400">
                    <Users className="mx-auto mb-3 h-12 w-12 opacity-25" />
                    <p className="text-sm">No team structure available</p>
                  </div>
                ) : null}
              </div>
            )}
          </TabsContent>

          <TabsContent value="birthdays" className="mt-0 flex-1 overflow-y-auto bg-gray-50 p-6">
            {loading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, idx) => <Skeleton key={idx} className="h-16 w-full" />)}</div>
            ) : birthdayMembers.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                <Cake className="mx-auto mb-3 h-12 w-12 opacity-25" />
                <p className="text-sm">No upcoming birthdays in the next 30 days</p>
              </div>
            ) : (
              <div className="max-w-2xl space-y-3">
                <p className="mb-4 text-xs text-gray-400">Upcoming birthdays in the next 30 days</p>
                {birthdayMembers.map(({ member, isToday, dateLabel }, idx) => (
                  <div key={member.id} className={cn("flex items-center gap-4 rounded-xl border bg-white p-4", isToday && "border-[#AA8038]/30 bg-red-50/30")}>
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarFallback className={cn("text-base font-semibold", AVATAR_COLORS[idx % AVATAR_COLORS.length])}>{initialsOf(member)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">{fullNameOf(member)}</p>
                      <p className="text-xs text-gray-500">{member.position || "No position"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium text-gray-700">{dateLabel}</p>
                      {isToday ? <Badge variant="secondary" className="mt-1 text-xs" style={{ backgroundColor: "#FFFAF0", color: "#AA8038" }}>Today</Badge> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="working-time" className="mt-0 flex-1 overflow-y-auto bg-gray-50 p-6">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, idx) => <Skeleton key={idx} className="h-10 w-full" />)}</div>
            ) : (
              <div className="max-w-4xl overflow-hidden rounded-xl border bg-white">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 hover:bg-gray-50">
                      <TableHead className="w-52 pl-6">Employee</TableHead>
                      {WORK_DAYS.map((day) => <TableHead key={day} className="w-16 text-center">{day}</TableHead>)}
                      <TableHead className="w-24 pr-6 text-center">Hours/day</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.slice(0, 50).map((member) => {
                      const schedule = member.workState === 0 ? [false, false, false, false, false, false, false] : DEFAULT_SCHEDULE;
                      const hoursPerDay = member.workState === 0 ? 0 : 8;
                      return (
                        <TableRow key={member.id} className="hover:bg-gray-50/50">
                          <TableCell className="pl-6">
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <Avatar className="h-7 w-7">
                                  <AvatarFallback className="bg-gray-100 text-xs text-gray-600">{initialsOf(member)}</AvatarFallback>
                                </Avatar>
                                <span className="absolute -bottom-0.5 -right-0.5"><StatusDot status={getAgentStatus(member)} size="sm" /></span>
                              </div>
                              <span className="max-w-32 truncate text-sm font-medium text-gray-800">{fullNameOf(member)}</span>
                            </div>
                          </TableCell>
                          {schedule.map((works, dayIndex) => (
                            <TableCell key={dayIndex} className="text-center">
                              {works ? <Check className="mx-auto h-4 w-4 text-green-500" /> : <span className="text-xs text-gray-300">-</span>}
                            </TableCell>
                          ))}
                          <TableCell className="pr-6 text-center text-sm text-gray-600">{hoursPerDay}h</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
