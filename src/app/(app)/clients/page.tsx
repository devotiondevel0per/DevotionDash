"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Building2,
  Download,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  UserCircle,
  Users,
} from "lucide-react";

type Organization = {
  id: string;
  name: string;
  type: string;
  status: string;
  rating: string;
  industry: string | null;
  leadSource: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  manager: { id: string; name: string; fullname: string } | null;
  sla: { id: string; name: string; hoursLimit: number } | null;
  _count: {
    contacts: number;
    emails?: number;
    chatDialogs?: number;
    serviceDeskRequests?: number;
    historyEntries?: number;
  };
};

type OrgDetail = Organization & {
  contacts: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    position: string | null;
  }>;
};

type OrgHistory = {
  id: string;
  userId: string | null;
  content: string;
  isSystem: boolean;
  createdAt: string;
  user: { id: string; name: string; fullname: string } | null;
};

type TeamUser = { id: string; name: string; fullname: string; email: string };

type OrgInsights = {
  summary: string;
  healthScore: number;
  highlights: string[];
  risks: string[];
  opportunities: string[];
  actionPlan: string[];
  generatedAt: string;
  fallback: boolean;
};

type OrgForm = {
  name: string;
  type: string;
  status: string;
  rating: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
  leadSource: string;
  managerId: string;
  country: string;
  city: string;
  address: string;
  comment: string;
};

const EMPTY_FORM: OrgForm = {
  name: "",
  type: "potential",
  status: "open",
  rating: "weak",
  email: "",
  phone: "",
  website: "",
  industry: "",
  leadSource: "",
  managerId: "none",
  country: "",
  city: "",
  address: "",
  comment: "",
};

const TYPE_ITEMS = [
  ["potential", "Potential"],
  ["client", "Client"],
  ["agent", "Agent"],
  ["partner", "Partner"],
] as const;

const STATUS_ITEMS = [
  ["open", "Open"],
  ["closed", "Closed"],
  ["rejected", "Rejected"],
] as const;

const RATING_ITEMS = [
  ["hot", "Hot"],
  ["good", "Good"],
  ["weak", "Weak"],
] as const;

const INDUSTRIES = [
  "Technology",
  "Finance",
  "Healthcare",
  "Manufacturing",
  "Retail",
  "Real Estate",
  "Education",
  "Media",
  "Consulting",
  "Legal",
  "Construction",
  "Hospitality",
  "Transportation",
  "Energy",
  "Other",
];

const LEAD_SOURCES = [
  "Website",
  "Referral",
  "Cold Call",
  "Trade Show",
  "Social Media",
  "Email Campaign",
  "Partner",
  "Other",
];

const TYPE_BADGE: Record<string, string> = {
  potential: "bg-amber-100 text-amber-700",
  client: "bg-blue-100 text-blue-700",
  agent: "bg-indigo-100 text-indigo-700",
  partner: "bg-teal-100 text-teal-700",
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-100 text-slate-700",
  rejected: "bg-red-100 text-red-700",
};

const RATING_BADGE: Record<string, string> = {
  hot: "bg-red-100 text-red-700",
  good: "bg-green-100 text-green-700",
  weak: "bg-gray-100 text-gray-600",
};

const AVATAR_COLORS = [
  "bg-[#FE0000]/10 text-[#FE0000]",
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-orange-100 text-orange-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
];

function displayName(user: { name: string; fullname: string } | null) {
  if (!user) return "Unassigned";
  return user.fullname || user.name;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelative(value: string) {
  const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function typeLabel(value: string) {
  return TYPE_ITEMS.find(([id]) => id === value)?.[1] ?? value;
}

function statusLabel(value: string) {
  return STATUS_ITEMS.find(([id]) => id === value)?.[1] ?? value;
}

function ratingLabel(value: string) {
  return RATING_ITEMS.find(([id]) => id === value)?.[1] ?? value;
}

function exportCSV(data: Organization[]) {
  const header = [
    "Name",
    "Type",
    "Status",
    "Rating",
    "Industry",
    "Lead Source",
    "Manager",
    "Email",
    "Phone",
    "City",
    "Country",
    "Contacts",
    "Updated",
  ];

  const rows = data.map((org) => [
    org.name,
    org.type,
    org.status,
    org.rating,
    org.industry ?? "",
    org.leadSource ?? "",
    displayName(org.manager),
    org.email ?? "",
    org.phone ?? "",
    org.city ?? "",
    org.country ?? "",
    String(org._count.contacts),
    formatDateTime(org.updatedAt),
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "organizations.csv";
  link.click();
  URL.revokeObjectURL(url);
}
function OrganizationFormDialog({
  open,
  onOpenChange,
  users,
  organization,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  users: TeamUser[];
  organization: Organization | null;
  onSaved: (org: Organization) => void;
}) {
  const isEdit = Boolean(organization);
  const [form, setForm] = useState<OrgForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setSaving(false);
      return;
    }

    if (!organization) {
      setForm(EMPTY_FORM);
      return;
    }

    setForm({
      name: organization.name,
      type: organization.type,
      status: organization.status,
      rating: organization.rating,
      email: organization.email ?? "",
      phone: organization.phone ?? "",
      website: organization.website ?? "",
      industry: organization.industry ?? "",
      leadSource: organization.leadSource ?? "",
      managerId: organization.manager?.id ?? "none",
      country: organization.country ?? "",
      city: organization.city ?? "",
      address: organization.address ?? "",
      comment: organization.comment ?? "",
    });
  }, [open, organization]);

  function setField<K extends keyof OrgForm>(key: K, value: OrgForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        status: form.status,
        rating: form.rating,
        email: form.email || undefined,
        phone: form.phone || undefined,
        website: form.website || undefined,
        industry: form.industry || undefined,
        leadSource: form.leadSource || undefined,
        managerId: form.managerId !== "none" ? form.managerId : null,
        country: form.country || undefined,
        city: form.city || undefined,
        address: form.address || undefined,
        comment: form.comment || undefined,
      };

      const response = await fetch(
        organization ? `/api/clients/${organization.id}` : "/api/clients",
        {
          method: organization ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = (await response.json()) as Organization | { error?: string };

      if (!response.ok) {
        toast.error((data as { error?: string }).error ?? "Failed to save organization");
        return;
      }

      onSaved(data as Organization);
      toast.success(organization ? "Organization updated" : "Organization created");
      onOpenChange(false);
    } catch {
      toast.error("Failed to save organization");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Organization" : "New Organization"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="Organization name"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(value) => setField("type", value ?? "potential")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_ITEMS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(value) => setField("status", value ?? "open")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_ITEMS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Rating</Label>
            <Select value={form.rating} onValueChange={(value) => setField("rating", value ?? "weak")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RATING_ITEMS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Manager</Label>
            <Select value={form.managerId} onValueChange={(value) => setField("managerId", value ?? "none")} items={{ "none": "Unassigned", ...Object.fromEntries(users.map((user) => [user.id, displayName(user)])) }}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>{displayName(user)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={form.email} onChange={(event) => setField("email", event.target.value)} placeholder="contact@company.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="+1 555 000 000" />
          </div>

          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input value={form.website} onChange={(event) => setField("website", event.target.value)} placeholder="https://company.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Industry</Label>
            <Select value={form.industry || "none"} onValueChange={(value) => setField("industry", value === "none" ? "" : value ?? "")}>
              <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {INDUSTRIES.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Lead Source</Label>
            <Select value={form.leadSource || "none"} onValueChange={(value) => setField("leadSource", value === "none" ? "" : value ?? "") }>
              <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {LEAD_SOURCES.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Country</Label>
            <Input value={form.country} onChange={(event) => setField("country", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={form.city} onChange={(event) => setField("city", event.target.value)} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={(event) => setField("address", event.target.value)} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={4} value={form.comment} onChange={(event) => setField("comment", event.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button className="bg-[#FE0000] text-white hover:bg-[#d70000]" onClick={() => void save()} disabled={saving || !form.name.trim()}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {isEdit ? "Save Changes" : "Create Organization"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrganizationDetailView({
  organizationId,
  canWrite,
  canManage,
  users,
  onBack,
  onUpdated,
  onDeleted,
}: {
  organizationId: string;
  canWrite: boolean;
  canManage: boolean;
  users: TeamUser[];
  onBack: () => void;
  onUpdated: (org: Organization) => void;
  onDeleted: (orgId: string) => void;
}) {
  const [organization, setOrganization] = useState<OrgDetail | null>(null);
  const [history, setHistory] = useState<OrgHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [insights, setInsights] = useState<OrgInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setHistoryLoading(true);
    try {
      const [orgRes, historyRes] = await Promise.all([
        fetch(`/api/clients/${organizationId}`, { cache: "no-store" }),
        fetch(`/api/clients/${organizationId}/history`, { cache: "no-store" }),
      ]);

      if (!orgRes.ok) throw new Error("org-load-failed");
      const orgData = (await orgRes.json()) as OrgDetail;
      setOrganization(orgData);

      if (historyRes.ok) {
        const historyData = (await historyRes.json()) as OrgHistory[];
        setHistory(Array.isArray(historyData) ? historyData : []);
      }
    } catch {
      toast.error("Failed to load organization");
    } finally {
      setLoading(false);
      setHistoryLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refreshInsights() {
    setInsightsLoading(true);
    try {
      const response = await fetch(`/api/clients/${organizationId}/insights`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("insight-failed");
      const data = (await response.json()) as OrgInsights;
      setInsights(data);
    } catch {
      toast.error("Unable to generate insights");
    } finally {
      setInsightsLoading(false);
    }
  }
  async function addHistoryNote() {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const response = await fetch(`/api/clients/${organizationId}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNote.trim() }),
      });
      const data = (await response.json()) as OrgHistory | { error?: string };
      if (!response.ok) {
        toast.error((data as { error?: string }).error ?? "Failed to add note");
        return;
      }
      setHistory((prev) => [data as OrgHistory, ...prev]);
      setNewNote("");
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    } finally {
      setAddingNote(false);
    }
  }

  async function closeOrganization() {
    const response = await fetch(`/api/clients/${organizationId}`, { method: "DELETE" });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(data.error ?? "Failed to close organization");
      return;
    }
    toast.success("Organization closed");
    onDeleted(organizationId);
    onBack();
  }

  if (loading) {
    return (
      <div className="flex-1 space-y-3 p-6">
        <Skeleton className="h-8 w-2/5" />
        <Skeleton className="h-5 w-1/3" />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!organization) {
    return <div className="flex flex-1 items-center justify-center text-sm text-gray-400">Organization not found</div>;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#f8f9fc]">
      <div className="border-b bg-white px-6 py-4">
        <button onClick={onBack} className="mb-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><ArrowLeft className="h-3.5 w-3.5" />Back to organizations</button>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-gray-900">{organization.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={cn("border-transparent", TYPE_BADGE[organization.type] ?? "bg-gray-100")}>{typeLabel(organization.type)}</Badge>
              <Badge variant="outline" className={cn("border-transparent", STATUS_BADGE[organization.status] ?? "bg-gray-100")}>{statusLabel(organization.status)}</Badge>
              <Badge variant="outline" className={cn("border-transparent", RATING_BADGE[organization.rating] ?? "bg-gray-100")}>{ratingLabel(organization.rating)}</Badge>
              <Badge variant="outline"><Users className="mr-1 h-3 w-3" />{organization._count.contacts} contacts</Badge>
              <Badge variant="outline"><Mail className="mr-1 h-3 w-3" />{organization._count.emails ?? 0} emails</Badge>
              <Badge variant="outline"><MessageSquare className="mr-1 h-3 w-3" />{organization._count.serviceDeskRequests ?? 0} requests</Badge>
            </div>
            <div className="mt-2 text-xs text-gray-500">Manager: <span className="font-medium text-gray-700">{displayName(organization.manager)}</span> · Updated {formatRelative(organization.updatedAt)}</div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => void refreshInsights()}><Bot className="mr-1.5 h-3.5 w-3.5" />Insights</Button>
            {canWrite ? <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button> : null}
            {canManage ? <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => void closeOrganization()}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Close</Button> : null}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b bg-white px-6">
          <TabsList className="h-10 rounded-none border-none bg-transparent p-0">
            <TabsTrigger value="overview" className="h-10 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-[#FE0000] data-[state=active]:bg-transparent data-[state=active]:text-[#FE0000]">Overview</TabsTrigger>
            <TabsTrigger value="contacts" className="h-10 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-[#FE0000] data-[state=active]:bg-transparent data-[state=active]:text-[#FE0000]">Contacts</TabsTrigger>
            <TabsTrigger value="timeline" className="h-10 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-[#FE0000] data-[state=active]:bg-transparent data-[state=active]:text-[#FE0000]">Timeline</TabsTrigger>
            <TabsTrigger value="insights" onClick={() => { if (!insights) void refreshInsights(); }} className="h-10 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-[#FE0000] data-[state=active]:bg-transparent data-[state=active]:text-[#FE0000]">AI Insights</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0 flex-1 overflow-y-auto p-5 bg-gray-50 space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Contact Details</p>
            <div className="space-y-2 text-sm text-gray-700">
              {organization.email ? <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" />{organization.email}</div> : null}
              {organization.phone ? <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400" />{organization.phone}</div> : null}
              {organization.website ? <div className="flex items-center gap-2"><Search className="h-4 w-4 text-gray-400" /><a href={organization.website.startsWith("http") ? organization.website : `https://${organization.website}`} target="_blank" rel="noreferrer" className="text-[#FE0000] hover:underline">{organization.website}</a></div> : null}
              {(organization.city || organization.country) ? <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" />{[organization.city, organization.country].filter(Boolean).join(", ")}</div> : null}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Business Context</p>
            <div className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
              <div><span className="text-gray-500">Industry:</span> {organization.industry ?? "-"}</div>
              <div><span className="text-gray-500">Lead Source:</span> {organization.leadSource ?? "-"}</div>
              <div><span className="text-gray-500">Created:</span> {formatDateTime(organization.createdAt)}</div>
              <div><span className="text-gray-500">Updated:</span> {formatDateTime(organization.updatedAt)}</div>
            </div>
            {organization.comment ? <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 whitespace-pre-line">{organization.comment}</p> : null}
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="mt-0 flex-1 overflow-y-auto p-5 bg-gray-50">
          {organization.contacts.length === 0 ? <div className="rounded-xl border border-dashed bg-white py-12 text-center text-gray-500">No linked contacts yet.</div> : (
            <div className="space-y-2">
              {organization.contacts.map((contact) => {
                const fullName = `${contact.firstName} ${contact.lastName}`.trim();
                return (
                  <div key={contact.id} className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5">
                    <Avatar className="h-9 w-9"><AvatarFallback className={cn("text-xs font-semibold", avatarColor(fullName))}>{initials(fullName)}</AvatarFallback></Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{fullName}</p>
                      <p className="truncate text-xs text-gray-500">{contact.position ?? "No position"}</p>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      {contact.email ? <p>{contact.email}</p> : null}
                      {contact.phone ? <p>{contact.phone}</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="mt-0 flex min-h-0 flex-1 flex-col bg-gray-50">
          {canWrite ? (
            <div className="border-b bg-white px-5 py-4">
              <Textarea rows={2} value={newNote} onChange={(event) => setNewNote(event.target.value)} placeholder="Add timeline note..." className="resize-none" onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void addHistoryNote(); }} />
              <div className="mt-2 flex justify-end"><Button size="sm" className="bg-[#FE0000] text-white hover:bg-[#d70000]" onClick={() => void addHistoryNote()} disabled={addingNote || !newNote.trim()}>{addingNote ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}Add Note</Button></div>
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {historyLoading ? <Skeleton className="h-12 w-full" /> : null}
            {history.length === 0 ? <div className="rounded-xl border border-dashed bg-white py-12 text-center text-gray-500">No timeline entries yet.</div> : history.map((entry) => (
              <div key={entry.id} className="flex gap-2.5">
                <div className={cn("mt-0.5 h-6 w-6 shrink-0 rounded-full flex items-center justify-center", entry.isSystem ? "bg-gray-100" : "bg-[#FE0000]/10")}>
                  {entry.isSystem ? <AlertCircle className="h-3.5 w-3.5 text-gray-500" /> : <UserCircle className="h-3.5 w-3.5 text-[#FE0000]" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-gray-700">{entry.content}</p>
                  <div className="mt-0.5 text-xs text-gray-400">{entry.user ? displayName(entry.user) : "System"} · {formatRelative(entry.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="insights" className="mt-0 flex-1 overflow-y-auto p-5 bg-gray-50">
          <div className="rounded-xl border border-red-100 bg-red-50/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#b00000]"><Sparkles className="h-4 w-4" />AI Insights</div>
              <Button size="sm" variant="outline" onClick={() => void refreshInsights()}>{insightsLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}Refresh</Button>
            </div>
            {insightsLoading ? <div className="space-y-2"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-2/3" /></div> : null}
            {!insightsLoading && !insights ? <p className="text-sm text-gray-500">Generate insights to analyze account health, risks, and opportunities.</p> : null}
            {insights ? (
              <div className="space-y-4 text-sm text-gray-700">
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Summary</p>
                  <p>{insights.summary}</p>
                </div>
                <div className="rounded-lg bg-white/70 px-3 py-2 text-xs text-gray-600">Health Score: <span className="font-semibold text-gray-900">{insights.healthScore}</span></div>
                {insights.highlights.length > 0 ? <div><p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Highlights</p><ul className="list-disc pl-5 space-y-1">{insights.highlights.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}</ul></div> : null}
                {insights.risks.length > 0 ? <div><p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Risks</p><ul className="list-disc pl-5 space-y-1">{insights.risks.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}</ul></div> : null}
                {insights.opportunities.length > 0 ? <div><p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Opportunities</p><ul className="list-disc pl-5 space-y-1">{insights.opportunities.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}</ul></div> : null}
                {insights.actionPlan.length > 0 ? <div><p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Action Plan</p><ul className="list-disc pl-5 space-y-1">{insights.actionPlan.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}</ul></div> : null}
              </div>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>

      {canWrite ? (
        <OrganizationFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          users={users}
          organization={organization}
          onSaved={(updated) => {
            setOrganization((prev) => (prev ? { ...prev, ...updated } : prev));
            onUpdated(updated);
          }}
        />
      ) : null}
    </div>
  );
}
export default function ClientsPage() {
  const { can } = usePermissions();
  const canWrite = can("clients", "write");
  const canManage = can("clients", "manage");

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeType, setActiveType] = useState("all");
  const [status, setStatus] = useState("all");
  const [rating, setRating] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [mineOnly, setMineOnly] = useState(false);

  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "500",
        sort: sort === "recent" ? "updated" : sort,
        ...(activeType !== "all" ? { type: activeType } : {}),
        ...(status !== "all" ? { status } : {}),
        ...(rating !== "all" ? { rating } : {}),
        ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
        ...(mineOnly ? { managerId: "me" } : {}),
      });

      const [orgRes, userRes] = await Promise.all([
        fetch(`/api/clients?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/team/users?isActive=true", { cache: "no-store" }),
      ]);

      if (!orgRes.ok) throw new Error("org-fetch-failed");
      const orgData = (await orgRes.json()) as Organization[];
      setOrganizations(Array.isArray(orgData) ? orgData : []);

      if (userRes.ok) {
        const userData = (await userRes.json()) as TeamUser[];
        setUsers(Array.isArray(userData) ? userData : []);
      }
    } catch {
      toast.error("Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }, [activeType, mineOnly, rating, searchQuery, sort, status]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadOrganizations();
    }, 180);
    return () => clearTimeout(timer);
  }, [loadOrganizations]);

  const sidebar = useMemo(() => {
    const count = (predicate: (org: Organization) => boolean) => organizations.filter(predicate).length;
    return [
      { id: "all", label: "All", count: organizations.length },
      { id: "potential", label: "Potential", count: count((org) => org.type === "potential") },
      { id: "client", label: "Clients", count: count((org) => org.type === "client") },
      { id: "partner", label: "Partners", count: count((org) => org.type === "partner") },
      { id: "agent", label: "Agents", count: count((org) => org.type === "agent") },
      { id: "hot", label: "Hot", count: count((org) => org.rating === "hot") },
      { id: "closed", label: "Closed", count: count((org) => org.status === "closed" || org.status === "rejected") },
    ];
  }, [organizations]);

  const stats = useMemo(() => ({
    total: organizations.length,
    active: organizations.filter((org) => org.status === "open").length,
    hot: organizations.filter((org) => org.rating === "hot").length,
    contacts: organizations.reduce((sum, org) => sum + org._count.contacts, 0),
  }), [organizations]);

  const visibleOrganizations = useMemo(() => {
    return organizations.filter((org) => {
      if (activeType === "hot") return org.rating === "hot";
      if (activeType === "closed") return org.status === "closed" || org.status === "rejected";
      if (activeType !== "all") return org.type === activeType;
      return true;
    });
  }, [activeType, organizations]);

  if (selectedOrganizationId) {
    return (
      <div className="flex h-full">
        <aside className="hidden w-64 shrink-0 border-r bg-white md:flex md:flex-col">
          <div className="border-b px-4 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">Organizations</h2>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {sidebar.map((item) => (
              <button key={item.id} onClick={() => setActiveType(item.id)} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm", activeType === item.id ? "bg-red-50 text-[#FE0000]" : "text-gray-600 hover:bg-gray-100")}>
                <span>{item.label}</span>
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{item.count}</span>
              </button>
            ))}
          </div>
        </aside>

        <OrganizationDetailView
          organizationId={selectedOrganizationId}
          canWrite={canWrite}
          canManage={canManage}
          users={users}
          onBack={() => setSelectedOrganizationId(null)}
          onUpdated={(updated) => {
            setOrganizations((prev) => prev.map((org) => (org.id === updated.id ? { ...org, ...updated } : org)));
          }}
          onDeleted={(id) => {
            setOrganizations((prev) => prev.filter((org) => org.id !== id));
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#f7f8fc]">
      <aside className="hidden w-64 shrink-0 border-r bg-white md:flex md:flex-col">
        <div className="border-b px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">Organizations</h2>
          <p className="text-xs text-gray-500">Accounts & relationships</p>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {sidebar.map((item) => (
            <button key={item.id} onClick={() => setActiveType(item.id)} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm", activeType === item.id ? "bg-red-50 text-[#FE0000]" : "text-gray-600 hover:bg-gray-100")}>
              <span>{item.label}</span>
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{item.count}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b bg-white px-6 py-5">
          <div className="rounded-2xl bg-gradient-to-r from-[#FE0000] via-[#d50000] to-[#8c0000] p-5 text-white shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Organization Command Center</h1>
                <p className="mt-1 text-sm text-red-100">Full lifecycle view with timeline and AI account insights.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => void loadOrganizations()}><RefreshCw className="mr-1.5 h-4 w-4" />Refresh</Button>
                <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => exportCSV(visibleOrganizations)}><Download className="mr-1.5 h-4 w-4" />Export</Button>
                {canWrite ? <Button className="bg-white text-[#b40000] hover:bg-red-50" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" />New Organization</Button> : null}
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-white/20 bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-red-100">Total</p><p className="text-xl font-semibold">{stats.total}</p></div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-red-100">Active</p><p className="text-xl font-semibold">{stats.active}</p></div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-red-100">Hot</p><p className="text-xl font-semibold">{stats.hot}</p></div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-red-100">Contacts</p><p className="text-xl font-semibold">{stats.contacts}</p></div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
            <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search organization, email, city, industry" className="h-9 pl-8" /></div>
            <Select value={status} onValueChange={(value) => setStatus(value ?? "all")}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All status</SelectItem>{STATUS_ITEMS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Select value={rating} onValueChange={(value) => setRating(value ?? "all")}><SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All rating</SelectItem>{RATING_ITEMS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Select value={sort} onValueChange={(value) => setSort(value ?? "recent")}><SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recent">Latest update</SelectItem><SelectItem value="name">Name A-Z</SelectItem><SelectItem value="created">Recently created</SelectItem><SelectItem value="rating">By rating</SelectItem></SelectContent></Select>
            <Button variant={mineOnly ? "default" : "outline"} onClick={() => setMineOnly((prev) => !prev)} className={mineOnly ? "h-9 bg-[#FE0000] text-white hover:bg-[#d70000]" : "h-9"}><Star className="mr-1.5 h-4 w-4" />My Accounts</Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? <div className="space-y-2">{Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-2xl" />)}</div> : (
            visibleOrganizations.length === 0 ? <div className="rounded-2xl border border-dashed bg-white py-16 text-center text-gray-500"><Building2 className="mx-auto mb-2 h-10 w-10 opacity-30" />No organizations matched your filters.</div> :
            <div className="space-y-2">
              {visibleOrganizations.map((organization) => (
                <button key={organization.id} onClick={() => setSelectedOrganizationId(organization.id)} className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-[#FE0000]/30 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <Avatar className="h-10 w-10"><AvatarFallback className={cn("text-xs font-semibold", avatarColor(organization.name))}>{initials(organization.name)}</AvatarFallback></Avatar>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-gray-900">{organization.name}</h3>
                        <p className="mt-1 line-clamp-2 text-xs text-gray-500">{organization.comment || organization.industry || "No description"}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                          <Badge variant="outline" className={cn("border-transparent", TYPE_BADGE[organization.type] ?? "bg-gray-100")}>{typeLabel(organization.type)}</Badge>
                          <Badge variant="outline" className={cn("border-transparent", STATUS_BADGE[organization.status] ?? "bg-gray-100")}>{statusLabel(organization.status)}</Badge>
                          <Badge variant="outline" className={cn("border-transparent", RATING_BADGE[organization.rating] ?? "bg-gray-100")}>{ratingLabel(organization.rating)}</Badge>
                          <Badge variant="outline"><Users className="mr-1 h-3 w-3" />{organization._count.contacts}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      <p>{displayName(organization.manager)}</p>
                      <p className="mt-1">{formatRelative(organization.updatedAt)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {canWrite ? (
        <OrganizationFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          users={users}
          organization={null}
          onSaved={(organization) => {
            setOrganizations((prev) => [organization, ...prev]);
            setSelectedOrganizationId(organization.id);
          }}
        />
      ) : null}
    </div>
  );
}
