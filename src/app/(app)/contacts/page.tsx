"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "sonner";
import { ArrowLeft, Building2, Download, Loader2, Mail, Pencil, Phone, Plus, RefreshCw, Search, Sparkles, Star, Trash2, UserCircle, Users } from "lucide-react";

type UserLite = { id: string; name: string; fullname: string };
type OrgLite = { id: string; name: string; type: string; status: string; rating: string; _count: { contacts: number } };
type Contact = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; mobile: string | null; position: string | null; department: string | null; city: string | null; country: string | null; note: string | null; createdAt: string; updatedAt: string; organization: OrgLite | null; createdBy: UserLite | null };
type ContactDetail = Contact & { relatedContacts: Array<{ id: string; firstName: string; lastName: string; updatedAt: string }> };
type Insight = { summary: string; relationshipScore: number; highlights: string[]; risks: string[]; opportunities: string[]; nextActions: string[] };
type FormState = { firstName: string; lastName: string; email: string; mobile: string; phone: string; position: string; department: string; city: string; country: string; note: string; organizationId: string };

const EMPTY_FORM: FormState = { firstName: "", lastName: "", email: "", mobile: "", phone: "", position: "", department: "", city: "", country: "", note: "", organizationId: "none" };
const AVATAR_COLORS = ["bg-[#FE0000]/10 text-[#FE0000]", "bg-blue-100 text-blue-700", "bg-green-100 text-green-700", "bg-orange-100 text-orange-700"];
const SIDEBAR = [{ id: "all", label: "All Contacts" }, { id: "assigned", label: "Linked to Organization" }, { id: "unassigned", label: "Unassigned" }, { id: "missing-email", label: "Missing Email" }, { id: "missing-phone", label: "Missing Phone" }] as const;

function name(item: { firstName: string; lastName: string }) { return `${item.firstName} ${item.lastName}`.trim(); }
function initials(value: string) { return value.split(" ").filter(Boolean).map((v) => v[0]).join("").slice(0, 2).toUpperCase(); }
function hasText(value: string | null | undefined) { return Boolean(value && value.trim()); }
function displayName(user: UserLite | null | undefined) { if (!user) return "Unassigned"; return user.fullname || user.name; }
function color(nameValue: string) { let hash = 0; for (let i = 0; i < nameValue.length; i += 1) hash = (hash * 31 + nameValue.charCodeAt(i)) >>> 0; return AVATAR_COLORS[hash % AVATAR_COLORS.length]; }
function relative(value: string) { const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60000); if (mins < 1) return "just now"; if (mins < 60) return `${mins}m ago`; const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`; return `${Math.floor(hrs / 24)}d ago`; }
function exportCSV(items: Contact[]) { const csv = [["Name", "Email", "Mobile", "Position", "Organization"], ...items.map((item) => [name(item), item.email ?? "", item.mobile ?? "", item.position ?? "", item.organization?.name ?? ""])].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "contacts.csv"; link.click(); URL.revokeObjectURL(url); }

function ContactDialog({ open, onOpenChange, organizations, contact, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; organizations: Array<{ id: string; name: string }>; contact: Contact | ContactDetail | null; onSaved: (item: Contact) => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!open) return; if (!contact) { setForm(EMPTY_FORM); return; } setForm({ firstName: contact.firstName, lastName: contact.lastName, email: contact.email ?? "", mobile: contact.mobile ?? "", phone: contact.phone ?? "", position: contact.position ?? "", department: contact.department ?? "", city: contact.city ?? "", country: contact.country ?? "", note: contact.note ?? "", organizationId: contact.organization?.id ?? "none" }); }, [open, contact]);
  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));
  async function save() {
    if (!form.firstName.trim() || !form.lastName.trim()) { toast.error("First name and last name are required"); return; }
    setSaving(true);
    try {
      const response = await fetch(contact ? `/api/contacts/${contact.id}` : "/api/contacts", { method: contact ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, organizationId: form.organizationId === "none" ? null : form.organizationId }) });
      const data = (await response.json()) as Contact | { error?: string };
      if (!response.ok) { toast.error((data as { error?: string }).error ?? "Failed to save contact"); return; }
      onSaved(data as Contact); onOpenChange(false); toast.success(contact ? "Contact updated" : "Contact created");
    } catch { toast.error("Failed to save contact"); } finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{contact ? "Edit Contact" : "New Contact"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>First Name *</Label><Input value={form.firstName} onChange={(e) => setField("firstName", e.target.value)} /></div>
          <div><Label>Last Name *</Label><Input value={form.lastName} onChange={(e) => setField("lastName", e.target.value)} /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={(e) => setField("email", e.target.value)} /></div>
          <div><Label>Organization</Label><Select value={form.organizationId} onValueChange={(v) => setField("organizationId", v ?? "none")} items={{ "none": "Unassigned", ...Object.fromEntries(organizations.map((org) => [org.id, org.name])) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{organizations.map((org) => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Mobile</Label><Input value={form.mobile} onChange={(e) => setField("mobile", e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} /></div>
          <div><Label>Position</Label><Input value={form.position} onChange={(e) => setField("position", e.target.value)} /></div>
          <div><Label>Department</Label><Input value={form.department} onChange={(e) => setField("department", e.target.value)} /></div>
          <div><Label>City</Label><Input value={form.city} onChange={(e) => setField("city", e.target.value)} /></div>
          <div><Label>Country</Label><Input value={form.country} onChange={(e) => setField("country", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Notes</Label><Textarea rows={3} value={form.note} onChange={(e) => setField("note", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#FE0000] text-white hover:bg-[#d70000]" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}{contact ? "Save Changes" : "Create Contact"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactDetailView({ contactId, canWrite, canManage, organizations, onBack, onUpdated, onDeleted }: { contactId: string; canWrite: boolean; canManage: boolean; organizations: Array<{ id: string; name: string }>; onBack: () => void; onUpdated: (item: Contact) => void; onDeleted: (id: string) => void }) {
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { const response = await fetch(`/api/contacts/${contactId}`, { cache: "no-store" }); if (!response.ok) throw new Error(); setContact((await response.json()) as ContactDetail); } catch { toast.error("Failed to load contact"); } finally { setLoading(false); } }, [contactId]);
  const loadInsight = useCallback(async () => { setInsightLoading(true); try { const response = await fetch(`/api/contacts/${contactId}/insights`, { method: "POST" }); if (!response.ok) throw new Error(); setInsight((await response.json()) as Insight); } catch { toast.error("Unable to generate insights"); } finally { setInsightLoading(false); } }, [contactId]);
  useEffect(() => { void load(); void loadInsight(); }, [load, loadInsight]);
  async function remove() { setDeleting(true); const response = await fetch(`/api/contacts/${contactId}`, { method: "DELETE" }); const data = (await response.json()) as { error?: string }; if (!response.ok) { toast.error(data.error ?? "Failed to delete"); setDeleting(false); return; } setConfirmDeleteOpen(false); onDeleted(contactId); onBack(); toast.success("Contact deleted"); setDeleting(false); }
  if (loading) return <div className="flex-1 space-y-3 p-6"><Skeleton className="h-8 w-1/3" />{Array.from({ length: 5 }).map((_, idx) => <Skeleton key={idx} className="h-20 w-full rounded-xl" />)}</div>;
  if (!contact) return <div className="flex flex-1 items-center justify-center text-sm text-gray-500">Contact not found</div>;
  const contactName = name(contact);
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#f8f9fc]">
      <div className="border-b bg-white px-6 py-4">
        <button onClick={onBack} className="mb-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><ArrowLeft className="h-3.5 w-3.5" />Back to contacts</button>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3"><Avatar className="h-11 w-11"><AvatarFallback className={cn("text-sm font-semibold", color(contactName))}>{initials(contactName)}</AvatarFallback></Avatar><div><h2 className="text-xl font-semibold text-gray-900">{contactName}</h2><p className="text-sm text-gray-500">{contact.position || "No position"}{contact.department ? ` - ${contact.department}` : ""}</p></div></div>
          <div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => void loadInsight()}>{insightLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}Insights</Button>{canWrite ? <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button> : null}{canManage ? <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => setConfirmDeleteOpen(true)}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete</Button> : null}</div>
        </div>
      </div>
      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-full justify-start rounded-none border-b bg-white px-4 py-0"><TabsTrigger value="overview" className="h-10 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-[#FE0000] data-[state=active]:bg-transparent data-[state=active]:text-[#FE0000]">Overview</TabsTrigger><TabsTrigger value="organization" className="h-10 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-[#FE0000] data-[state=active]:bg-transparent data-[state=active]:text-[#FE0000]">Organization</TabsTrigger><TabsTrigger value="insights" className="h-10 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-[#FE0000] data-[state=active]:bg-transparent data-[state=active]:text-[#FE0000]">AI Insights</TabsTrigger></TabsList>
        <TabsContent value="overview" className="mt-0 flex-1 overflow-y-auto p-5 bg-gray-50">
          <div className="rounded-xl border bg-white p-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>{hasText(contact.email) ? <a className="text-[#b60000] hover:underline" href={`mailto:${contact.email ?? ""}`}>{contact.email}</a> : <span className="text-gray-400">No email</span>}</div>
              <div>{hasText(contact.mobile) ? <a className="hover:underline" href={`tel:${contact.mobile ?? ""}`}>{contact.mobile}</a> : <span className="text-gray-400">No mobile</span>}</div>
              <div>{hasText(contact.phone) ? <a className="hover:underline" href={`tel:${contact.phone ?? ""}`}>{contact.phone}</a> : <span className="text-gray-400">No phone</span>}</div>
              <div>{[contact.city, contact.country].filter(Boolean).join(", ") || <span className="text-gray-400">No location</span>}</div>
            </div>
            {hasText(contact.note) ? <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-line">{contact.note}</p> : null}
          </div>
        </TabsContent>
        <TabsContent value="organization" className="mt-0 flex-1 overflow-y-auto p-5 bg-gray-50">
          {!contact.organization ? <div className="rounded-xl border border-dashed bg-white py-12 text-center text-gray-500">Contact is not linked to an organization.</div> : <div className="space-y-3"><div className="rounded-xl border bg-white p-4 text-sm text-gray-700"><div className="mb-2 flex items-center gap-2 font-semibold text-gray-900"><Building2 className="h-4 w-4 text-[#b00000]" />{contact.organization.name}</div><div className="grid gap-2 sm:grid-cols-2"><div>Type: {contact.organization.type}</div><div>Status: {contact.organization.status}</div><div>Rating: {contact.organization.rating}</div><div>Contacts: {contact.organization._count.contacts}</div></div></div><div className="rounded-xl border bg-white p-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Related Contacts</p>{contact.relatedContacts.length === 0 ? <div className="rounded-lg border border-dashed py-8 text-center text-sm text-gray-500">No related contacts found.</div> : <div className="space-y-2">{contact.relatedContacts.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><div>{name(item)}</div><div className="text-xs text-gray-400">{relative(item.updatedAt)}</div></div>)}</div>}</div></div>}
        </TabsContent>
        <TabsContent value="insights" className="mt-0 flex-1 overflow-y-auto p-5 bg-gray-50">
          <div className="rounded-xl border border-red-100 bg-red-50/40 p-4">
            <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold text-[#b00000]"><Sparkles className="h-4 w-4" />AI Insights</div><Button size="sm" variant="outline" onClick={() => void loadInsight()}>{insightLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}Refresh</Button></div>
            {!insight ? <p className="text-sm text-gray-500">Generate insights for this contact.</p> : <div className="space-y-3 text-sm text-gray-700"><p>{insight.summary}</p><div className="rounded-lg bg-white/70 px-3 py-2 text-xs">Relationship Score: <span className="font-semibold">{insight.relationshipScore}</span></div>{insight.highlights.length > 0 ? <ul className="list-disc space-y-1 pl-5">{insight.highlights.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}</ul> : null}</div>}
          </div>
        </TabsContent>
      </Tabs>
      {canWrite ? <ContactDialog open={editOpen} onOpenChange={setEditOpen} organizations={organizations} contact={contact} onSaved={(saved) => { setContact((prev) => prev ? { ...prev, ...saved, relatedContacts: prev.relatedContacts } : prev); onUpdated(saved); }} /> : null}
      <ConfirmDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen} title="Delete contact?" description={`This will permanently delete ${contactName}.`} confirmLabel="Delete" loading={deleting} onConfirm={() => void remove()} />
    </div>
  );
}

export default function ContactsPage() {
  const { can } = usePermissions();
  const canWrite = can("contacts", "write");
  const canManage = can("contacts", "manage");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [activeBucket, setActiveBucket] = useState<(typeof SIDEBAR)[number]["id"]>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [organizationFilter, setOrganizationFilter] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500", sort: sort === "recent" ? "updated" : sort, ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}), ...(organizationFilter !== "all" ? { organizationId: organizationFilter } : {}), ...(mineOnly ? { mineOnly: "1" } : {}) });
      const [contactsRes, organizationsRes] = await Promise.all([fetch(`/api/contacts?${params.toString()}`, { cache: "no-store" }), fetch("/api/clients?limit=500&sort=name", { cache: "no-store" })]);
      if (!contactsRes.ok) throw new Error("contacts-failed");
      const contactsData = (await contactsRes.json()) as Contact[];
      setContacts(Array.isArray(contactsData) ? contactsData : []);
      if (organizationsRes.ok) { const orgData = (await organizationsRes.json()) as Array<{ id: string; name: string }>; setOrganizations(Array.isArray(orgData) ? orgData.map((item) => ({ id: item.id, name: item.name })) : []); }
    } catch { toast.error("Failed to load contacts"); } finally { setLoading(false); }
  }, [mineOnly, organizationFilter, searchQuery, sort]);
  useEffect(() => { const timer = setTimeout(() => void load(), 180); return () => clearTimeout(timer); }, [load]);
  const counts = useMemo(() => ({ all: contacts.length, assigned: contacts.filter((item) => Boolean(item.organization)).length, unassigned: contacts.filter((item) => !item.organization).length, "missing-email": contacts.filter((item) => !hasText(item.email)).length, "missing-phone": contacts.filter((item) => !hasText(item.mobile) && !hasText(item.phone)).length }), [contacts]);
  const stats = useMemo(() => ({ total: contacts.length, withEmail: contacts.filter((item) => hasText(item.email)).length, withPhone: contacts.filter((item) => hasText(item.mobile) || hasText(item.phone)).length, organizations: new Set(contacts.map((item) => item.organization?.id).filter(Boolean)).size }), [contacts]);
  const visible = useMemo(() => contacts.filter((item) => { if (activeBucket === "assigned" && !item.organization) return false; if (activeBucket === "unassigned" && item.organization) return false; if (activeBucket === "missing-email" && hasText(item.email)) return false; if (activeBucket === "missing-phone" && (hasText(item.mobile) || hasText(item.phone))) return false; return true; }), [activeBucket, contacts]);
  if (selectedContactId) return <div className="flex h-full bg-[#f7f8fc]"><aside className="hidden w-64 shrink-0 border-r bg-white md:flex md:flex-col"><div className="border-b px-4 py-4"><h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">Contacts</h2></div><div className="flex-1 space-y-1 overflow-y-auto p-2">{SIDEBAR.map((item) => <button key={item.id} onClick={() => setActiveBucket(item.id)} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm", activeBucket === item.id ? "bg-red-50 text-[#FE0000]" : "text-gray-600 hover:bg-gray-100")}><span>{item.label}</span><span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{counts[item.id]}</span></button>)}</div></aside><ContactDetailView contactId={selectedContactId} canWrite={canWrite} canManage={canManage} organizations={organizations} onBack={() => setSelectedContactId(null)} onUpdated={(updated) => setContacts((prev) => prev.map((item) => item.id === updated.id ? { ...item, ...updated } : item))} onDeleted={(id) => setContacts((prev) => prev.filter((item) => item.id !== id))} /></div>;
  return (
    <div className="flex h-full bg-[#f7f8fc]">
      <aside className="hidden w-64 shrink-0 border-r bg-white md:flex md:flex-col">
        <div className="border-b px-4 py-4"><h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">Contacts</h2><p className="text-xs text-gray-500">People & relationship network</p></div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">{SIDEBAR.map((item) => <button key={item.id} onClick={() => setActiveBucket(item.id)} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm", activeBucket === item.id ? "bg-red-50 text-[#FE0000]" : "text-gray-600 hover:bg-gray-100")}><span>{item.label}</span><span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{counts[item.id]}</span></button>)}</div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b bg-white px-6 py-5">
          <div className="rounded-2xl bg-gradient-to-r from-[#FE0000] via-[#d50000] to-[#8c0000] p-5 text-white shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Contact Command Center</h1><p className="mt-1 text-sm text-red-100">Detailed contact management with AI relationship insights.</p></div><div className="flex items-center gap-2"><Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => void load()}><RefreshCw className="mr-1.5 h-4 w-4" />Refresh</Button><Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => exportCSV(visible)}><Download className="mr-1.5 h-4 w-4" />Export</Button>{canWrite ? <Button className="bg-white text-[#b40000] hover:bg-red-50" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" />New Contact</Button> : null}</div></div>
            <div className="mt-4 grid gap-3 md:grid-cols-4"><div className="rounded-xl border border-white/20 bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-red-100">Total</p><p className="text-xl font-semibold">{stats.total}</p></div><div className="rounded-xl border border-white/20 bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-red-100">With Email</p><p className="text-xl font-semibold">{stats.withEmail}</p></div><div className="rounded-xl border border-white/20 bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-red-100">With Phone</p><p className="text-xl font-semibold">{stats.withPhone}</p></div><div className="rounded-xl border border-white/20 bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-red-100">Organizations</p><p className="text-xl font-semibold">{stats.organizations}</p></div></div>
          </div>
          <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_auto_auto_auto]"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search name, email, position, organization" className="h-9 pl-8" /></div><Select value={organizationFilter} onValueChange={(value) => setOrganizationFilter(value ?? "all")} items={{ "all": "All organizations", "none": "Unassigned only", ...Object.fromEntries(organizations.map((org) => [org.id, org.name])) }}><SelectTrigger className="h-9 w-[210px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All organizations</SelectItem><SelectItem value="none">Unassigned only</SelectItem>{organizations.map((org) => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}</SelectContent></Select><Select value={sort} onValueChange={(value) => setSort(value ?? "recent")}><SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recent">Latest update</SelectItem><SelectItem value="name">Name A-Z</SelectItem><SelectItem value="created">Recently created</SelectItem></SelectContent></Select><Button variant={mineOnly ? "default" : "outline"} onClick={() => setMineOnly((prev) => !prev)} className={mineOnly ? "h-9 bg-[#FE0000] text-white hover:bg-[#d70000]" : "h-9"}><Star className="mr-1.5 h-4 w-4" />My Contacts</Button></div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{loading ? <div className="space-y-2">{Array.from({ length: 7 }).map((_, idx) => <Skeleton key={idx} className="h-24 w-full rounded-2xl" />)}</div> : visible.length === 0 ? <div className="rounded-2xl border border-dashed bg-white py-16 text-center text-gray-500"><Users className="mx-auto mb-2 h-10 w-10 opacity-30" />No contacts matched your filters.</div> : <div className="space-y-2">{visible.map((contact) => { const contactName = name(contact); return <div key={contact.id} onClick={() => setSelectedContactId(contact.id)} className="cursor-pointer rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-[#FE0000]/30 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><Avatar className="h-10 w-10"><AvatarFallback className={cn("text-xs font-semibold", color(contactName))}>{initials(contactName)}</AvatarFallback></Avatar><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-gray-900">{contactName}</h3><p className="mt-1 truncate text-xs text-gray-500">{contact.position || "No position"}{contact.department ? ` - ${contact.department}` : ""}</p><div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs"><Badge variant="outline"><UserCircle className="mr-1 h-3 w-3" />{displayName(contact.createdBy)}</Badge>{contact.organization ? <Badge variant="outline"><Building2 className="mr-1 h-3 w-3" />{contact.organization.name}</Badge> : <Badge variant="outline">Unassigned</Badge>}{hasText(contact.email) ? <Badge variant="outline"><Mail className="mr-1 h-3 w-3" />Email</Badge> : null}{hasText(contact.mobile) || hasText(contact.phone) ? <Badge variant="outline"><Phone className="mr-1 h-3 w-3" />Phone</Badge> : null}</div></div></div><div className="text-right text-xs text-gray-400">{relative(contact.updatedAt)}</div></div></div>; })}</div>}</div>
      </div>
      {canWrite ? <ContactDialog open={createOpen} onOpenChange={setCreateOpen} organizations={organizations} contact={null} onSaved={(saved) => { setContacts((prev) => [saved, ...prev]); setSelectedContactId(saved.id); }} /> : null}
    </div>
  );
}
