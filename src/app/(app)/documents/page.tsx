"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  Upload,
  Folder,
  FolderOpen,
  FileText,
  File,
  FileImage,
  FileSpreadsheet,
  Download,
  Eye,
  Trash2,
  ChevronRight,
  Pencil,
  X,
  FolderPlus,
  ExternalLink,
  LayoutGrid,
  List,
  CheckSquare,
  Square,
  Copy,
  ClipboardPaste,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";


type DocumentFolder = {
  id: string;
  name: string;
  parentId: string | null;
  _count: { children: number; documents: number };
  accessLevel?: "module" | "private";
  owner?: { id: string; name: string; fullname: string } | null;
  permission?: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    isOwner?: boolean;
    shared?: boolean;
  };
  myAccess?: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
  };
  shareCount?: number;
  sharedWith?: ShareEntry[];
};

type DocumentItem = {
  id: string;
  name: string;
  mimeType: string | null;
  fileSize: number | null;
  content: string | null;
  fileUrl: string | null;
  accessLevel?: "module" | "private";
  ownerId?: string;
  permission?: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    isOwner?: boolean;
    shared?: boolean;
  };
  myAccess?: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
  };
  shareCount?: number;
  sharedWith?: ShareEntry[];
  updatedAt: string;
  owner: { id: string; name: string; fullname: string } | null;
  folder: { id: string; name: string } | null;
};

type DocumentResponse = {
  folders: DocumentFolder[];
  documents: DocumentItem[];
  category?: "all" | "shared" | "sharedWithMe";
};

type ShareUser = {
  id: string;
  name: string;
  email: string;
};

type ShareEntry = {
  userId: string;
  userName: string;
  userEmail: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
};

type DocumentCategory = "all" | "shared" | "sharedWithMe";
type DocumentCounts = {
  shared: number;
  sharedWithMe: number;
};


function detectKind(doc: DocumentItem) {
  const mime = (doc.mimeType ?? "").toLowerCase();
  const name = doc.name.toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("sheet") || name.endsWith(".xlsx") || name.endsWith(".csv")) return "xlsx";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) return "image";
  if (mime.includes("word") || /\.(docx?)$/.test(name)) return "doc";
  return "file";
}

function formatBytes(size: number | null) {
  if (!size || size <= 0) return "-";
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function displayName(user: { name: string; fullname: string } | null) {
  if (!user) return "-";
  return user.fullname || user.name;
}

function documentDownloadUrl(doc: DocumentItem) {
  if (doc.id) return `/api/documents/${doc.id}/download`;
  return doc.fileUrl;
}

function FileIcon({ kind, className }: { kind: string; className?: string }) {
  const cls = cn("h-4 w-4 shrink-0", className);
  if (kind === "folder") return <Folder className={cn(cls, "text-yellow-500")} />;
  if (kind === "pdf") return <FileText className={cn(cls, "text-red-500")} />;
  if (kind === "xlsx") return <FileSpreadsheet className={cn(cls, "text-green-600")} />;
  if (kind === "image") return <FileImage className={cn(cls, "text-blue-500")} />;
  if (kind === "doc") return <FileText className={cn(cls, "text-blue-700")} />;
  return <File className={cn(cls, "text-gray-400")} />;
}

function folderSelectionKey(id: string) {
  return `folder:${id}`;
}

function documentSelectionKey(id: string) {
  return `doc:${id}`;
}


function NewFolderDialog({
  open, onClose, onCreated, parentId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (folder: DocumentFolder) => void;
  parentId: string | null;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setName(""); }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "folder", name: name.trim(), parentId, accessLevel: "private" }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to create folder");
      }
      const { folder } = (await res.json()) as { folder: DocumentFolder };
      toast.success("Folder created");
      onCreated(folder);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>New Folder</DialogTitle></DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="folder-name">Folder name *</Label>
            <Input id="folder-name" placeholder="e.g. Contracts" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()} style={{ backgroundColor: "#FE0000", color: "#fff" }}>
              {saving ? "Creating..." : "Create Folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewDocumentDialog({
  open, onClose, onCreated, folderId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (doc: DocumentItem) => void;
  folderId: string | null;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setName(""); setContent(""); } }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "document", name: name.trim(), folderId, content, accessLevel: "private" }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to create document");
      }
      const { document } = (await res.json()) as { document: DocumentItem };
      toast.success("Document created");
      onCreated(document);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create document");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Document</DialogTitle></DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="doc-name">Document name *</Label>
            <Input id="doc-name" placeholder="e.g. Project Brief" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-content">Content</Label>
            <Textarea id="doc-content" placeholder="Start writing..." rows={6} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()} style={{ backgroundColor: "#FE0000", color: "#fff" }}>
              {saving ? "Creating..." : "Create Document"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDocumentDialog({
  open, onClose, onSaved, doc,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (doc: DocumentItem) => void;
  doc: DocumentItem | null;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !doc) return;
    setName(doc.name);
    setContent(doc.content ?? "");
  }, [open, doc]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!doc || !name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), content }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to update document");
      }
      const updated = (await res.json()) as DocumentItem;
      toast.success("Document updated");
      onSaved(updated);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update document");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit Document</DialogTitle></DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="edit-doc-name">Name *</Label>
            <Input id="edit-doc-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-doc-content">Content</Label>
            <Textarea id="edit-doc-content" rows={10} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()} style={{ backgroundColor: "#FE0000", color: "#fff" }}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShareDocumentDialog({
  open,
  onClose,
  doc,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  doc: DocumentItem | null;
  onSaved: (docId: string, accessLevel: "module" | "private") => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<ShareUser[]>([]);
  const [accessLevel, setAccessLevel] = useState<"module" | "private">("private");
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");

  useEffect(() => {
    if (!open || !doc) return;
    let mounted = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/documents/${doc.id}/share`),
      fetch("/api/documents/share-users?limit=200"),
    ])
      .then(async ([shareRes, usersRes]) => {
        if (!shareRes.ok) {
          const err = (await shareRes.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error ?? "Failed to load sharing options");
        }
        if (!usersRes.ok) throw new Error("Failed to load users");

        const shareData = await shareRes.json() as { accessLevel: "module" | "private"; shares: ShareEntry[] };
        const usersData = await usersRes.json() as ShareUser[];
        if (!mounted) return;
        setAccessLevel(shareData.accessLevel ?? "private");
        setShares(Array.isArray(shareData.shares) ? shareData.shares : []);
        setUsers(Array.isArray(usersData) ? usersData : []);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        toast.error(error instanceof Error ? error.message : "Failed to load sharing settings");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, doc]);

  function toggleShare(userId: string, key: "canRead" | "canWrite" | "canDelete", value: boolean) {
    setShares((prev) =>
      prev.map((entry) => {
        if (entry.userId !== userId) return entry;
        if (key === "canWrite" && value) return { ...entry, canWrite: true, canRead: true };
        if (key === "canDelete" && value) return { ...entry, canDelete: true, canRead: true };
        if (key === "canRead" && !value) return { ...entry, canRead: false, canWrite: false, canDelete: false };
        return { ...entry, [key]: value };
      })
    );
  }

  function addSelectedUser() {
    if (!selectedUserId) return;
    const user = users.find((item) => item.id === selectedUserId);
    if (!user) return;
    if (shares.some((entry) => entry.userId === user.id)) {
      toast.error("User already has a share entry");
      return;
    }
    setShares((prev) => [
      ...prev,
      {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        canRead: true,
        canWrite: false,
        canDelete: false,
      },
    ]);
    setSelectedUserId("");
  }

  function removeShare(userId: string) {
    setShares((prev) => prev.filter((entry) => entry.userId !== userId));
  }

  async function handleSave() {
    if (!doc) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/share`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessLevel, shares }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to save shares");
      }
      toast.success("Sharing updated");
      onSaved(doc.id, accessLevel);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save shares");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share Document</DialogTitle>
        </DialogHeader>
        {!doc ? (
          <div className="py-6 text-sm text-gray-500">No document selected.</div>
        ) : loading ? (
          <div className="py-8 text-sm text-gray-500 text-center">Loading sharing settings...</div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-800">{doc.name}</p>
              <p className="text-xs text-gray-500">Choose who can view, edit, or delete this document.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-access-level">Access</Label>
              <select
                id="doc-access-level"
                className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm bg-white"
                value={accessLevel}
                onChange={(e) => setAccessLevel((e.target.value === "private" ? "private" : "module"))}
              >
                <option value="module">Module users can view</option>
                <option value="private">Private (shared users only)</option>
              </select>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <Label htmlFor="share-user">Add user</Label>
              <div className="flex items-center gap-2">
                <select
                  id="share-user"
                  className="h-9 flex-1 rounded-md border border-gray-300 px-3 text-sm bg-white"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">Select a user</option>
                  {users
                    .filter((user) => user.id !== doc.owner?.id)
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                </select>
                <Button type="button" variant="outline" onClick={addSelectedUser} disabled={!selectedUserId}>
                  Add
                </Button>
              </div>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">User</th>
                    <th className="text-center px-2 py-2 font-medium">View</th>
                    <th className="text-center px-2 py-2 font-medium">Edit</th>
                    <th className="text-center px-2 py-2 font-medium">Delete</th>
                    <th className="text-right px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {shares.length === 0 ? (
                    <tr>
                      <td className="px-3 py-5 text-center text-gray-400" colSpan={5}>
                        No user-specific shares configured.
                      </td>
                    </tr>
                  ) : (
                    shares.map((entry) => (
                      <tr key={entry.userId} className="border-t">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-800">{entry.userName}</p>
                          <p className="text-xs text-gray-500">{entry.userEmail}</p>
                        </td>
                        <td className="text-center px-2 py-2">
                          <input
                            type="checkbox"
                            checked={entry.canRead}
                            onChange={(e) => toggleShare(entry.userId, "canRead", e.target.checked)}
                          />
                        </td>
                        <td className="text-center px-2 py-2">
                          <input
                            type="checkbox"
                            checked={entry.canWrite}
                            onChange={(e) => toggleShare(entry.userId, "canWrite", e.target.checked)}
                          />
                        </td>
                        <td className="text-center px-2 py-2">
                          <input
                            type="checkbox"
                            checked={entry.canDelete}
                            onChange={(e) => toggleShare(entry.userId, "canDelete", e.target.checked)}
                          />
                        </td>
                        <td className="text-right px-3 py-2">
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeShare(entry.userId)}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            style={{ backgroundColor: "#FE0000", color: "#fff" }}
            onClick={() => void handleSave()}
            disabled={saving || loading || !doc}
          >
            {saving ? "Saving..." : "Save Sharing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareFolderDialog({
  open,
  onClose,
  folder,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  folder: DocumentFolder | null;
  onSaved: (folderId: string, accessLevel: "module" | "private") => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<ShareUser[]>([]);
  const [accessLevel, setAccessLevel] = useState<"module" | "private">("private");
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");

  useEffect(() => {
    if (!open || !folder) return;
    let mounted = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/documents/folders/${folder.id}/share`),
      fetch("/api/documents/share-users?limit=200"),
    ])
      .then(async ([shareRes, usersRes]) => {
        if (!shareRes.ok) {
          const err = (await shareRes.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error ?? "Failed to load folder sharing options");
        }
        if (!usersRes.ok) throw new Error("Failed to load users");

        const shareData = await shareRes.json() as { accessLevel: "module" | "private"; shares: ShareEntry[] };
        const usersData = await usersRes.json() as ShareUser[];
        if (!mounted) return;
        setAccessLevel(shareData.accessLevel ?? "private");
        setShares(Array.isArray(shareData.shares) ? shareData.shares : []);
        setUsers(Array.isArray(usersData) ? usersData : []);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        toast.error(error instanceof Error ? error.message : "Failed to load folder sharing settings");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, folder]);

  function toggleShare(userId: string, key: "canRead" | "canWrite" | "canDelete", value: boolean) {
    setShares((prev) =>
      prev.map((entry) => {
        if (entry.userId !== userId) return entry;
        if (key === "canWrite" && value) return { ...entry, canWrite: true, canRead: true };
        if (key === "canDelete" && value) return { ...entry, canDelete: true, canRead: true };
        if (key === "canRead" && !value) return { ...entry, canRead: false, canWrite: false, canDelete: false };
        return { ...entry, [key]: value };
      })
    );
  }

  function addSelectedUser() {
    if (!selectedUserId) return;
    const user = users.find((item) => item.id === selectedUserId);
    if (!user) return;
    if (shares.some((entry) => entry.userId === user.id)) {
      toast.error("User already has a share entry");
      return;
    }
    setShares((prev) => [
      ...prev,
      {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        canRead: true,
        canWrite: false,
        canDelete: false,
      },
    ]);
    setSelectedUserId("");
  }

  function removeShare(userId: string) {
    setShares((prev) => prev.filter((entry) => entry.userId !== userId));
  }

  async function handleSave() {
    if (!folder) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/folders/${folder.id}/share`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessLevel, shares }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to save folder shares");
      }
      toast.success("Folder sharing updated");
      onSaved(folder.id, accessLevel);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save folder shares");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share Folder</DialogTitle>
        </DialogHeader>
        {!folder ? (
          <div className="py-6 text-sm text-gray-500">No folder selected.</div>
        ) : loading ? (
          <div className="py-8 text-sm text-gray-500 text-center">Loading folder sharing settings...</div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-800">{folder.name}</p>
              <p className="text-xs text-gray-500">Choose who can view, edit, or delete this folder.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="folder-access-level">Access</Label>
              <select
                id="folder-access-level"
                className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm bg-white"
                value={accessLevel}
                onChange={(e) => setAccessLevel((e.target.value === "private" ? "private" : "module"))}
              >
                <option value="module">Module users can view</option>
                <option value="private">Private (shared users only)</option>
              </select>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <Label htmlFor="folder-share-user">Add user</Label>
              <div className="flex items-center gap-2">
                <select
                  id="folder-share-user"
                  className="h-9 flex-1 rounded-md border border-gray-300 px-3 text-sm bg-white"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">Select a user</option>
                  {users
                    .filter((user) => user.id !== folder.owner?.id)
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                </select>
                <Button type="button" variant="outline" onClick={addSelectedUser} disabled={!selectedUserId}>
                  Add
                </Button>
              </div>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">User</th>
                    <th className="text-center px-2 py-2 font-medium">View</th>
                    <th className="text-center px-2 py-2 font-medium">Edit</th>
                    <th className="text-center px-2 py-2 font-medium">Delete</th>
                    <th className="text-right px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {shares.length === 0 ? (
                    <tr>
                      <td className="px-3 py-5 text-center text-gray-400" colSpan={5}>
                        No user-specific shares configured.
                      </td>
                    </tr>
                  ) : (
                    shares.map((entry) => (
                      <tr key={entry.userId} className="border-t">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-800">{entry.userName}</p>
                          <p className="text-xs text-gray-500">{entry.userEmail}</p>
                        </td>
                        <td className="text-center px-2 py-2">
                          <input
                            type="checkbox"
                            checked={entry.canRead}
                            onChange={(e) => toggleShare(entry.userId, "canRead", e.target.checked)}
                          />
                        </td>
                        <td className="text-center px-2 py-2">
                          <input
                            type="checkbox"
                            checked={entry.canWrite}
                            onChange={(e) => toggleShare(entry.userId, "canWrite", e.target.checked)}
                          />
                        </td>
                        <td className="text-center px-2 py-2">
                          <input
                            type="checkbox"
                            checked={entry.canDelete}
                            onChange={(e) => toggleShare(entry.userId, "canDelete", e.target.checked)}
                          />
                        </td>
                        <td className="text-right px-3 py-2">
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeShare(entry.userId)}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            style={{ backgroundColor: "#FE0000", color: "#fff" }}
            onClick={() => void handleSave()}
            disabled={saving || loading || !folder}
          >
            {saving ? "Saving..." : "Save Folder Sharing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkShareDialog({
  open,
  onClose,
  docs,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  docs: DocumentItem[];
  onSaved: () => void;
}) {
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<ShareUser[]>([]);
  const [action, setAction] = useState<"share" | "unshare">("share");
  const [targetUserId, setTargetUserId] = useState("");
  const [canRead, setCanRead] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [accessLevel, setAccessLevel] = useState<"unchanged" | "module" | "private">("unchanged");

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoadingUsers(true);
    setAction("share");
    setTargetUserId("");
    setCanRead(true);
    setCanWrite(false);
    setCanDelete(false);
    setAccessLevel("unchanged");

    fetch("/api/documents/share-users?limit=200")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load users");
        return response.json();
      })
      .then((data: ShareUser[]) => {
        if (!mounted) return;
        setUsers(Array.isArray(data) ? data : []);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        toast.error(error instanceof Error ? error.message : "Failed to load users");
      })
      .finally(() => {
        if (mounted) setLoadingUsers(false);
      });

    return () => {
      mounted = false;
    };
  }, [open]);

  const documentIds = useMemo(
    () => Array.from(new Set(docs.map((doc) => doc.id))),
    [docs]
  );

  const selectedCount = documentIds.length;

  async function handleSave() {
    if (!targetUserId) {
      toast.error("Please select a user");
      return;
    }
    if (selectedCount === 0) {
      toast.error("No documents selected");
      return;
    }

    setSaving(true);
    try {
      const payload: {
        documentIds: string[];
        action: "share" | "unshare";
        targetUserId: string;
        canRead?: boolean;
        canWrite?: boolean;
        canDelete?: boolean;
        accessLevel?: "module" | "private";
      } = {
        documentIds,
        action,
        targetUserId,
      };

      if (action === "share") {
        payload.canRead = canRead || canWrite || canDelete;
        payload.canWrite = canWrite;
        payload.canDelete = canDelete;
        if (accessLevel !== "unchanged") payload.accessLevel = accessLevel;
      }

      const response = await fetch("/api/documents/shares/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => null)) as
        | {
          error?: string;
          updated?: number;
          processed?: number;
          denied?: number;
          ok?: boolean;
        }
        | null;

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "Failed to update bulk sharing");
      }

      const updated = body.updated ?? 0;
      const denied = body.denied ?? 0;
      const processed = body.processed ?? selectedCount;

      if (action === "share") {
        toast.success(`Shared ${updated} document${updated === 1 ? "" : "s"}`);
      } else {
        toast.success(`Unshared ${updated} document${updated === 1 ? "" : "s"}`);
      }

      if (denied > 0) {
        toast.error(`${denied} document${denied === 1 ? "" : "s"} were skipped due to permissions`);
      } else if (processed === 0) {
        toast.error("No documents were processed");
      }

      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk share update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Share Documents</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {selectedCount} selected document{selectedCount === 1 ? "" : "s"}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-action">Action</Label>
            <select
              id="bulk-action"
              className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm bg-white"
              value={action}
              onChange={(event) => setAction(event.target.value === "unshare" ? "unshare" : "share")}
            >
              <option value="share">Share with user</option>
              <option value="unshare">Remove sharing for user</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-target-user">User</Label>
            <select
              id="bulk-target-user"
              className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm bg-white"
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
              disabled={loadingUsers}
            >
              <option value="">{loadingUsers ? "Loading users..." : "Select a user"}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </div>

          {action === "share" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-access-level">Access level</Label>
                <select
                  id="bulk-access-level"
                  className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm bg-white"
                  value={accessLevel}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next === "module" || next === "private" || next === "unchanged") {
                      setAccessLevel(next);
                    }
                  }}
                >
                  <option value="unchanged">Keep current access level</option>
                  <option value="module">Set module access</option>
                  <option value="private">Set private access</option>
                </select>
              </div>

              <div className="rounded-lg border px-3 py-2 space-y-2">
                <p className="text-sm font-medium text-gray-700">Permissions</p>
                <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={canRead}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setCanRead(checked);
                        if (!checked) {
                          setCanWrite(false);
                          setCanDelete(false);
                        }
                      }}
                    />
                    View
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={canWrite}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setCanWrite(checked);
                        if (checked) setCanRead(true);
                      }}
                    />
                    Edit
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={canDelete}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setCanDelete(checked);
                        if (checked) setCanRead(true);
                      }}
                    />
                    Delete
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            style={{ backgroundColor: "#FE0000", color: "#fff" }}
            onClick={() => void handleSave()}
            disabled={saving || selectedCount === 0 || !targetUserId}
          >
            {saving ? "Saving..." : action === "share" ? "Share Selected" : "Unshare Selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  open, onClose, onUploaded, folderId,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: (doc: DocumentItem) => void;
  folderId: string | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setFile(null); }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSaving(true);
    try {
      // Store metadata; content is not uploaded to external storage in this implementation
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "document",
          name: file.name,
          folderId,
          mimeType: file.type || null,
          fileSize: file.size,
          accessLevel: "private",
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to upload");
      }
      const { document } = (await res.json()) as { document: DocumentItem };
      toast.success("File registered");
      onUploaded(document);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Upload File</DialogTitle></DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-1">
          <label
            className={cn(
              "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors",
              file ? "border-[#FE0000]/40 bg-[#FE0000]/5" : "border-gray-200 hover:border-gray-300"
            )}
          >
            <Upload className="h-8 w-8 text-gray-400" />
            {file ? (
              <div className="text-center">
                <p className="text-sm font-medium text-gray-800">{file.name}</p>
                <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">Click to select file</p>
                <p className="text-xs text-gray-400">Any file type</p>
              </div>
            )}
            <input type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {file && (
            <button type="button" onClick={() => setFile(null)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500">
              <X className="h-3 w-3" /> Remove
            </button>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !file} style={{ backgroundColor: "#FE0000", color: "#fff" }}>
              {saving ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  open, onClose, onRenamed, item,
}: {
  open: boolean;
  onClose: () => void;
  onRenamed: (id: string, newName: string) => void;
  item: { id: string; name: string; type: "folder" | "file" } | null;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open && item) setName(item.name); }, [open, item]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !item) return;
    setSaving(true);
    try {
      const url = item.type === "folder"
        ? `/api/documents/folders/${item.id}`
        : `/api/documents/${item.id}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to rename");
      }
      toast.success("Renamed");
      onRenamed(item.id, name.trim());
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename {item?.type === "folder" ? "Folder" : "Document"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="rename-input">New name *</Label>
            <Input id="rename-input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()} style={{ backgroundColor: "#FE0000", color: "#fff" }}>
              {saving ? "Saving..." : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ViewDocumentDialog({
  open, onClose, doc,
}: {
  open: boolean;
  onClose: () => void;
  doc: DocumentItem | null;
}) {
  if (!doc) return null;
  const resolvedDoc = doc;
  const kind = detectKind(resolvedDoc);

  function handleDownload() {
    const downloadUrl = documentDownloadUrl(resolvedDoc);
    if (downloadUrl) {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = resolvedDoc.name;
      a.click();
      return;
    }
    if (resolvedDoc.content) {
      const blob = new Blob([resolvedDoc.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = resolvedDoc.name + ".txt";
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileIcon kind={kind} />
            {resolvedDoc.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>Owner: <strong className="text-gray-700">{displayName(resolvedDoc.owner)}</strong></span>
            <span>Modified: <strong className="text-gray-700">{formatDate(resolvedDoc.updatedAt)}</strong></span>
            <span>Size: <strong className="text-gray-700">{formatBytes(resolvedDoc.fileSize)}</strong></span>
            {resolvedDoc.folder && <span>Folder: <strong className="text-gray-700">{resolvedDoc.folder.name}</strong></span>}
          </div>

          {resolvedDoc.fileUrl ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-center gap-3">
              <FileIcon kind={kind} className="h-8 w-8" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{resolvedDoc.name}</p>
                <p className="text-xs text-gray-400">{formatBytes(resolvedDoc.fileSize)}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => window.open(documentDownloadUrl(resolvedDoc) ?? resolvedDoc.fileUrl!, "_blank")}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
              </Button>
            </div>
          ) : resolvedDoc.content ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 max-h-96 overflow-y-auto">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{resolvedDoc.content}</pre>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-400 text-sm">No preview available</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {(resolvedDoc.fileUrl || resolvedDoc.content) && (
            <Button onClick={handleDownload} style={{ backgroundColor: "#FE0000", color: "#fff" }}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export default function DocumentsPage() {
  const { can, access, loading: permLoading } = usePermissions();
  const canRead = can("documents", "read");
  const canWrite = can("documents", "write");
  const canManage = can("documents", "manage");
  const currentUserId = access?.userId ?? "";

  const [allFolders, setAllFolders] = useState<DocumentFolder[]>([]);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [subFolders, setSubFolders] = useState<DocumentFolder[]>([]);
  const [documentCounts, setDocumentCounts] = useState<DocumentCounts>({ shared: 0, sharedWithMe: 0 });
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingContent, setLoadingContent] = useState(true);
  const [activeFolder, setActiveFolder] = useState<string>("all");
  const [category, setCategory] = useState<DocumentCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [layoutMode, setLayoutMode] = useState<"list" | "grid">("list");
  const [reloadTick, setReloadTick] = useState(0);

  // Dialogs
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<DocumentItem | null>(null);
  const [shareDoc, setShareDoc] = useState<DocumentItem | null>(null);
  const [shareFolder, setShareFolder] = useState<DocumentFolder | null>(null);
  const [bulkShareOpen, setBulkShareOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; type: "folder" | "file" } | null>(null);
  const [viewDoc, setViewDoc] = useState<DocumentItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clipboardItem, setClipboardItem] = useState<
    | { type: "folder"; folder: DocumentFolder }
    | { type: "document"; doc: DocumentItem }
    | null
  >(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<
    | {
      x: number;
      y: number;
      target: { type: "folder"; folder: DocumentFolder } | { type: "document"; doc: DocumentItem };
    }
    | null
  >(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  // Load all folders (for sidebar tree)
  useEffect(() => {
    let mounted = true;
    setLoadingFolders(true);
    fetch("/api/documents/folders")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: DocumentFolder[]) => { if (mounted) setAllFolders(Array.isArray(data) ? data : []); })
      .catch(() => { if (mounted) toast.error("Failed to load folders"); })
      .finally(() => { if (mounted) setLoadingFolders(false); });
    return () => { mounted = false; };
  }, []);

  // Load content of active folder/category
  useEffect(() => {
    let mounted = true;
    setLoadingContent(true);
    const params = new URLSearchParams();
    params.set("category", category);
    if (category === "all" && activeFolder !== "all") params.set("folderId", activeFolder);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    params.set("limit", "500");

    fetch(`/api/documents?${params.toString()}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: DocumentResponse) => {
        if (!mounted) return;
        setSubFolders(Array.isArray(data.folders) ? data.folders : []);
        setDocs(Array.isArray(data.documents) ? data.documents : []);
      })
      .catch(() => { if (mounted) toast.error("Failed to load documents"); })
      .finally(() => { if (mounted) setLoadingContent(false); });
    return () => { mounted = false; };
  }, [activeFolder, category, searchQuery, reloadTick]);

  useEffect(() => {
    let mounted = true;
    fetch("/api/documents/counts")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load counts");
        return response.json();
      })
      .then((data: DocumentCounts) => {
        if (!mounted) return;
        setDocumentCounts({
          shared: typeof data.shared === "number" ? data.shared : 0,
          sharedWithMe: typeof data.sharedWithMe === "number" ? data.sharedWithMe : 0,
        });
      })
      .catch(() => {
        if (!mounted) return;
        setDocumentCounts({ shared: 0, sharedWithMe: 0 });
      });
    return () => {
      mounted = false;
    };
  }, [reloadTick, docs.length, subFolders.length]);

  function canEditDoc(doc: DocumentItem) {
    if (typeof doc.permission?.canWrite === "boolean") return doc.permission.canWrite;
    return canWrite && (canManage || doc.owner?.id === currentUserId);
  }

  function canDeleteDoc(doc: DocumentItem) {
    if (typeof doc.permission?.canDelete === "boolean") return doc.permission.canDelete;
    return canManage || (canWrite && doc.owner?.id === currentUserId);
  }

  function canShareDoc(doc: DocumentItem) {
    return canManage || doc.owner?.id === currentUserId || Boolean(doc.permission?.isOwner);
  }

  function canShareFolder(folder: DocumentFolder) {
    return canManage || folder.owner?.id === currentUserId || Boolean(folder.permission?.isOwner);
  }

  function canRenameFolder(folder?: DocumentFolder) {
    if (folder && typeof folder.permission?.canWrite === "boolean") return folder.permission.canWrite;
    return canWrite;
  }

  function canDeleteFolder(folder: DocumentFolder) {
    const canDeleteByPermission =
      typeof folder.permission?.canDelete === "boolean"
        ? folder.permission.canDelete
        : canManage;
    return canDeleteByPermission && folder._count.children === 0 && folder._count.documents === 0;
  }

  const visibleSelectionKeys = useMemo(() => {
    const keys: string[] = [];
    for (const folder of subFolders) keys.push(folderSelectionKey(folder.id));
    for (const doc of docs) keys.push(documentSelectionKey(doc.id));
    return keys;
  }, [subFolders, docs]);

  const selectedCount = selectedKeys.size;
  const allVisibleSelected = visibleSelectionKeys.length > 0 && visibleSelectionKeys.every((key) => selectedKeys.has(key));
  const selectedDocs = useMemo(
    () => docs.filter((doc) => selectedKeys.has(documentSelectionKey(doc.id))),
    [docs, selectedKeys]
  );
  const selectedShareableDocs = useMemo(
    () =>
      selectedDocs.filter(
        (doc) => canManage || doc.owner?.id === currentUserId || Boolean(doc.permission?.isOwner)
      ),
    [selectedDocs, canManage, currentUserId]
  );
  const selectedFolders = useMemo(
    () => subFolders.filter((folder) => selectedKeys.has(folderSelectionKey(folder.id))),
    [subFolders, selectedKeys]
  );

  useEffect(() => {
    setSelectedKeys(new Set());
    setContextMenu(null);
  }, [activeFolder, category, searchQuery]);

  useEffect(() => {
    const visibleSet = new Set(visibleSelectionKeys);
    setSelectedKeys((prev) => {
      const next = new Set(Array.from(prev).filter((key) => visibleSet.has(key)));
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [visibleSelectionKeys]);

  useEffect(() => {
    if (!contextMenu) return;

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setContextMenu(null);
    }

    function onOutsideClick(event: MouseEvent) {
      const node = event.target as Node;
      if (contextMenuRef.current && !contextMenuRef.current.contains(node)) {
        setContextMenu(null);
      }
    }

    function onScroll() {
      setContextMenu(null);
    }

    document.addEventListener("keydown", onEscape);
    document.addEventListener("mousedown", onOutsideClick);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("mousedown", onOutsideClick);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [contextMenu]);

  // Build folder lookup map
  const folderLookup = useMemo(() => {
    const map = new Map<string, DocumentFolder>();
    for (const f of allFolders) map.set(f.id, f);
    return map;
  }, [allFolders]);

  // Build sidebar tree (flattened with depth)
  const folderTree = useMemo(() => {
    const childrenMap = new Map<string | null, DocumentFolder[]>();
    for (const f of allFolders) {
      const pid = f.parentId ?? null;
      const list = childrenMap.get(pid) ?? [];
      list.push(f);
      childrenMap.set(pid, list);
    }
    for (const list of childrenMap.values()) list.sort((a, b) => a.name.localeCompare(b.name));

    const flat: Array<{ id: string; name: string; depth: number; count: number }> = [];
    const visit = (parentId: string | null, depth: number) => {
      for (const f of childrenMap.get(parentId) ?? []) {
        flat.push({ id: f.id, name: f.name, depth, count: f._count.children + f._count.documents });
        visit(f.id, depth + 1);
      }
    };
    visit(null, 0);
    return flat;
  }, [allFolders]);

  // Build breadcrumb path
  const breadcrumb = useMemo(() => {
    if (category === "shared") {
      return [{ id: "shared", name: "Shared" }];
    }
    if (category === "sharedWithMe") {
      return [{ id: "sharedWithMe", name: "Shared With Me" }];
    }
    if (activeFolder === "all") return [{ id: "all", name: "All Documents" }];
    const path: Array<{ id: string; name: string }> = [];
    let current: DocumentFolder | undefined = folderLookup.get(activeFolder);
    while (current) {
      path.unshift({ id: current.id, name: current.name });
      current = current.parentId ? folderLookup.get(current.parentId) : undefined;
    }
    return [{ id: "all", name: "All Documents" }, ...path];
  }, [activeFolder, category, folderLookup]);

  const currentFolderId = category === "all" && activeFolder !== "all" ? activeFolder : null;

  // Handlers
  function navigateTo(folderId: string) {
    setCategory("all");
    setActiveFolder(folderId);
    setSearchQuery("");
    setContextMenu(null);
  }

  function changeCategory(next: DocumentCategory) {
    setCategory(next);
    setSearchQuery("");
    setSelectedKeys(new Set());
    setContextMenu(null);
    setActiveFolder("all");
  }

  function toggleSelection(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const key of visibleSelectionKeys) next.delete(key);
      } else {
        for (const key of visibleSelectionKeys) next.add(key);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  function openContextMenu(
    event: React.MouseEvent,
    target: { type: "folder"; folder: DocumentFolder } | { type: "document"; doc: DocumentItem }
  ) {
    event.preventDefault();
    const width = 220;
    const height = 320;
    const x = Math.max(8, Math.min(event.clientX, window.innerWidth - width));
    const y = Math.max(8, Math.min(event.clientY, window.innerHeight - height));
    setContextMenu({ x, y, target });
  }

  function handleFolderCreated(folder: DocumentFolder) {
    setAllFolders((prev) => [...prev, folder]);
    if (activeFolder === "all" || folder.parentId === activeFolder) {
      setSubFolders((prev) => [...prev, folder]);
    }
  }

  function handleDocCreated(doc: DocumentItem) {
    setDocs((prev) => [doc, ...prev]);
    // Update folder count in sidebar
    if (doc.folder) {
      setAllFolders((prev) =>
        prev.map((f) =>
          f.id === doc.folder!.id
            ? { ...f, _count: { ...f._count, documents: f._count.documents + 1 } }
            : f
        )
      );
    }
  }

  function handleDocUpdated(updated: DocumentItem) {
    setDocs((prev) => prev.map((doc) => (doc.id === updated.id ? { ...doc, ...updated } : doc)));
    setViewDoc((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
  }

  function handleRenamed(id: string, newName: string) {
    setSubFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: newName } : f)));
    setAllFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: newName } : f)));
    setDocs((prev) => prev.map((doc) => (doc.id === id ? { ...doc, name: newName } : doc)));
    setViewDoc((prev) => (prev?.id === id ? { ...prev, name: newName } : prev));
  }

  async function handleDeleteDoc(doc: DocumentItem, options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;
    setDeletingId(doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to delete");
      }
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        next.delete(documentSelectionKey(doc.id));
        return next;
      });
      if (doc.folder) {
        setAllFolders((prev) =>
          prev.map((f) =>
            f.id === doc.folder!.id
              ? { ...f, _count: { ...f._count, documents: Math.max(0, f._count.documents - 1) } }
              : f
          )
        );
      }
      if (!silent) toast.success("Document deleted");
      return true;
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : "Failed to delete");
      return false;
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteFolder(folder: DocumentFolder, options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;
    setDeletingId(folder.id);
    try {
      const res = await fetch(`/api/documents/folders/${folder.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to delete folder");
      }
      setSubFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setAllFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        next.delete(folderSelectionKey(folder.id));
        return next;
      });
      if (!silent) toast.success("Folder deleted");
      return true;
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : "Failed to delete folder");
      return false;
    } finally {
      setDeletingId(null);
    }
  }

  function handleDownload(doc: DocumentItem) {
    const downloadUrl = documentDownloadUrl(doc);
    if (downloadUrl) {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = doc.name;
      a.click();
      return;
    }
    if (doc.content) {
      const blob = new Blob([doc.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name + ".txt";
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  function handleShareUpdated(docId: string, accessLevel: "module" | "private") {
    setDocs((prev) => prev.map((doc) => (doc.id === docId ? { ...doc, accessLevel } : doc)));
    setViewDoc((prev) => (prev?.id === docId ? { ...prev, accessLevel } : prev));
    setReloadTick((prev) => prev + 1);
  }

  function handleFolderShareUpdated(folderId: string, accessLevel: "module" | "private") {
    setSubFolders((prev) => prev.map((folder) => (folder.id === folderId ? { ...folder, accessLevel } : folder)));
    setAllFolders((prev) => prev.map((folder) => (folder.id === folderId ? { ...folder, accessLevel } : folder)));
    setReloadTick((prev) => prev + 1);
  }

  function handleBulkShareSaved() {
    setReloadTick((prev) => prev + 1);
    setSelectedKeys(new Set());
  }

  function handleCopyItem(item: { type: "folder"; folder: DocumentFolder } | { type: "document"; doc: DocumentItem }) {
    setClipboardItem(item);
    toast.success(`${item.type === "folder" ? "Folder" : "Document"} copied`);
  }

  async function handlePasteIntoFolder(targetFolderId: string | null) {
    if (!clipboardItem) {
      toast.error("Nothing to paste");
      return;
    }
    if (!canWrite) {
      toast.error("You do not have permission to paste here");
      return;
    }

    try {
      if (clipboardItem.type === "document") {
        const source = clipboardItem.doc;
        const res = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "document",
            name: `${source.name} (Copy)`,
            folderId: targetFolderId,
            content: source.content,
            fileUrl: source.fileUrl,
            fileSize: source.fileSize,
            mimeType: source.mimeType,
            accessLevel: source.accessLevel ?? "module",
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error ?? "Failed to paste document");
        }
        const { document } = (await res.json()) as { document: DocumentItem };
        if (activeFolder === "all" || targetFolderId === activeFolder) {
          setDocs((prev) => [document, ...prev]);
        }
        toast.success("Document pasted");
        return;
      }

      const source = clipboardItem.folder;
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "folder",
          name: `${source.name} (Copy)`,
          parentId: targetFolderId,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to paste folder");
      }
      const { folder } = (await res.json()) as { folder: DocumentFolder };
      setAllFolders((prev) => [...prev, folder]);
      if (activeFolder === "all" || targetFolderId === activeFolder) {
        setSubFolders((prev) => [...prev, folder]);
      }
      toast.success("Folder pasted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Paste failed");
    }
  }

  async function handleBulkDeleteSelected() {
    if (selectedKeys.size === 0) return;

    const selectedDocsLocal = docs.filter((doc) => selectedKeys.has(documentSelectionKey(doc.id)));
    const selectedFoldersLocal = subFolders.filter((folder) => selectedKeys.has(folderSelectionKey(folder.id)));

    let deleted = 0;
    let failed = 0;

    for (const doc of selectedDocsLocal) {
      if (!canDeleteDoc(doc)) {
        failed += 1;
        continue;
      }
      const ok = await handleDeleteDoc(doc, { silent: true });
      if (ok) deleted += 1;
      else failed += 1;
    }

    for (const folder of selectedFoldersLocal) {
      if (!canDeleteFolder(folder)) {
        failed += 1;
        continue;
      }
      const ok = await handleDeleteFolder(folder, { silent: true });
      if (ok) deleted += 1;
      else failed += 1;
    }

    if (deleted > 0) {
      toast.success(`Deleted ${deleted} item${deleted === 1 ? "" : "s"}`);
    }
    if (failed > 0) {
      toast.error(`${failed} item${failed === 1 ? "" : "s"} could not be deleted due to permissions or content constraints`);
    }
  }

  const totalItems = subFolders.length + docs.length;
  const selectedDeletableCount = selectedDocs.filter((doc) => canDeleteDoc(doc)).length
    + selectedFolders.filter((folder) => canDeleteFolder(folder)).length;
  const showSharingColumn = category !== "all"
    || docs.some((doc) => (doc.sharedWith?.length ?? 0) > 0)
    || subFolders.some((folder) => (folder.sharedWith?.length ?? 0) > 0);

  if (permLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        Loading permissions...
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center">
            <p className="text-sm font-medium text-gray-800">You do not have access to Documents.</p>
            <p className="mt-1 text-xs text-gray-500">Please contact an administrator for permission.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex h-full">
      {/* Sidebar */}
      <div className="w-60 border-r bg-white flex flex-col shrink-0">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Documents</h2>
          {canWrite && (
            <button
              onClick={() => setNewFolderOpen(true)}
              className="text-gray-400 hover:text-[#FE0000] transition-colors"
              title="New folder"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          <button
            onClick={() => changeCategory("all")}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
              category === "all" ? "bg-[#FE0000]/10 text-[#FE0000] font-medium" : "text-gray-600 hover:bg-gray-100"
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {category === "all" ? <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" /> : <Folder className="h-4 w-4 text-yellow-500 shrink-0" />}
              <span className="truncate">All Documents</span>
            </div>
          </button>
          <button
            onClick={() => changeCategory("shared")}
            className={cn(
              "w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
              category === "shared" ? "bg-[#FE0000]/10 text-[#FE0000] font-medium" : "text-gray-600 hover:bg-gray-100"
            )}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Share2 className="h-4 w-4 shrink-0" />
              <span className="truncate">Shared</span>
            </span>
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0",
              category === "shared" ? "bg-[#FE0000]/15 text-[#FE0000]" : "bg-gray-100 text-gray-500"
            )}>
              {documentCounts.shared}
            </span>
          </button>
          <button
            onClick={() => changeCategory("sharedWithMe")}
            className={cn(
              "w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
              category === "sharedWithMe" ? "bg-[#FE0000]/10 text-[#FE0000] font-medium" : "text-gray-600 hover:bg-gray-100"
            )}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">Shared With Me</span>
            </span>
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0",
              category === "sharedWithMe" ? "bg-[#FE0000]/15 text-[#FE0000]" : "bg-gray-100 text-gray-500"
            )}>
              {documentCounts.sharedWithMe}
            </span>
          </button>

          {category === "all" && (
            <>
              <div className="pt-3 pb-1 px-2 text-[11px] uppercase tracking-wide text-gray-400">Folders</div>
              {loadingFolders ? (
                <div className="px-3 py-2 text-xs text-gray-400">Loading...</div>
              ) : (
                folderTree.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => navigateTo(folder.id)}
                    className={cn(
                      "w-full flex items-center justify-between rounded-md text-sm transition-colors",
                      activeFolder === folder.id ? "bg-[#FE0000]/10 text-[#FE0000] font-medium" : "text-gray-600 hover:bg-gray-100"
                    )}
                    style={{ padding: "7px 10px", paddingLeft: `${10 + folder.depth * 14}px` }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
                      {activeFolder === folder.id
                        ? <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" />
                        : <Folder className="h-4 w-4 text-yellow-500 shrink-0" />}
                      <span className="truncate">{folder.name}</span>
                    </div>
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ml-1",
                      activeFolder === folder.id ? "bg-[#FE0000]/15 text-[#FE0000]" : "bg-gray-100 text-gray-500"
                    )}>
                      {folder.count}
                    </span>
                  </button>
                ))
              )}
            </>
          )}
        </nav>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b bg-white px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {canWrite && (
              <>
                <Button size="sm" style={{ backgroundColor: "#FE0000", color: "#fff" }} onClick={() => setUploadOpen(true)}>
                  <Upload className="h-4 w-4 mr-1.5" />
                  Upload
                </Button>
                <Button size="sm" variant="outline" onClick={() => setNewDocOpen(true)}>
                  <FileText className="h-4 w-4 mr-1.5" />
                  New Document
                </Button>
                <Button size="sm" variant="outline" onClick={() => setNewFolderOpen(true)}>
                  <FolderPlus className="h-4 w-4 mr-1.5" />
                  New Folder
                </Button>
              </>
            )}
            <span className="text-sm text-gray-400 ml-1">{totalItems} item{totalItems !== 1 ? "s" : ""}</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border overflow-hidden">
              <button
                type="button"
                onClick={() => setLayoutMode("list")}
                className={cn("h-8 px-2.5 text-xs", layoutMode === "list" ? "bg-[#FE0000]/10 text-[#FE0000]" : "text-gray-500 hover:bg-gray-50")}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("grid")}
                className={cn("h-8 px-2.5 text-xs border-l", layoutMode === "grid" ? "bg-[#FE0000]/10 text-[#FE0000]" : "text-gray-500 hover:bg-gray-50")}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search documents..."
                className="pl-8 h-8 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-2 border-b bg-gray-50 flex items-center gap-1 text-xs text-gray-500 overflow-x-auto">
          {breadcrumb.map((crumb, idx) => (
            <span key={crumb.id} className="flex items-center gap-1 shrink-0">
              {idx > 0 && <ChevronRight className="h-3 w-3 text-gray-300" />}
              <button
                onClick={() => {
                  if (category === "all") {
                    navigateTo(crumb.id);
                    return;
                  }
                  if (crumb.id === "shared") {
                    changeCategory("shared");
                    return;
                  }
                  if (crumb.id === "sharedWithMe") {
                    changeCategory("sharedWithMe");
                  }
                }}
                className={cn(
                  "hover:text-[#FE0000] transition-colors",
                  idx === breadcrumb.length - 1 ? "font-medium text-gray-800" : "hover:underline"
                )}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {totalItems > 0 && (
          <div className="px-6 py-2.5 border-b bg-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={toggleSelectAllVisible}>
                {allVisibleSelected ? <CheckSquare className="h-3.5 w-3.5 mr-1" /> : <Square className="h-3.5 w-3.5 mr-1" />}
                {allVisibleSelected ? "Unselect all" : "Select all"}
              </Button>
              {selectedCount > 0 && (
                <>
                  <Badge variant="secondary" className="text-xs">{selectedCount} selected</Badge>
                  <Button size="sm" variant="outline" onClick={clearSelection}>Clear</Button>
                  {selectedDocs.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setBulkShareOpen(true)}
                      disabled={selectedShareableDocs.length === 0}
                    >
                      <Share2 className="h-3.5 w-3.5 mr-1" />
                      Share Selected
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => void handleBulkDeleteSelected()}
                    disabled={selectedDeletableCount === 0 || deletingId !== null}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete Selected
                  </Button>
                  {selectedDocs.length > 0 && selectedShareableDocs.length < selectedDocs.length && (
                    <span className="text-xs text-amber-600">
                      Only {selectedShareableDocs.length}/{selectedDocs.length} documents can be shared
                    </span>
                  )}
                </>
              )}
            </div>
            <p className="text-xs text-gray-400">Right-click any item for quick actions</p>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <Card className="rounded-none border-0 shadow-none">
            <CardContent className="p-0">
              {loadingContent ? (
                <div className="p-8 text-sm text-gray-400 text-center">Loading...</div>
              ) : totalItems === 0 ? (
                <div className="py-20 text-center text-gray-400">
                  <Folder className="h-12 w-12 mx-auto mb-3 opacity-25" />
                  <p className="text-sm font-medium">{searchQuery ? "No results found" : "This folder is empty"}</p>
                  {canWrite && !searchQuery && (
                    <div className="flex items-center justify-center gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={() => setNewDocOpen(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> New Document
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setNewFolderOpen(true)}>
                        <FolderPlus className="h-3.5 w-3.5 mr-1" /> New Folder
                      </Button>
                    </div>
                  )}
                </div>
              ) : layoutMode === "list" ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 hover:bg-gray-50">
                      <TableHead className="w-10 pl-4"></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-24">Type</TableHead>
                      <TableHead className="w-36">Owner</TableHead>
                      <TableHead className="w-32">Modified</TableHead>
                      <TableHead className="w-24">Size</TableHead>
                      {showSharingColumn && <TableHead className="w-56">Sharing</TableHead>}
                      <TableHead className="w-32 text-right pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subFolders.map((folder) => {
                      const key = folderSelectionKey(folder.id);
                      const selected = selectedKeys.has(key);
                      const canEdit = canRenameFolder(folder);
                      const canDeleteByPermission =
                        typeof folder.permission?.canDelete === "boolean"
                          ? folder.permission.canDelete
                          : canManage;
                      const canDelete = canDeleteFolder(folder);
                      return (
                        <TableRow
                          key={`folder-${folder.id}`}
                          className={cn("cursor-pointer hover:bg-primary/5 group", selected && "bg-[#FE0000]/5")}
                          onClick={() => navigateTo(folder.id)}
                          onContextMenu={(e) => openContextMenu(e, { type: "folder", folder })}
                        >
                          <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSelection(key)}
                              className="h-4 w-4 rounded border-gray-300"
                              aria-label={`Select folder ${folder.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Folder className="h-4 w-4 text-yellow-500 shrink-0" />
                              <span className="text-sm font-medium text-gray-800">{folder.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[11px] uppercase bg-yellow-50 text-yellow-700">Folder</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">-</TableCell>
                          <TableCell className="text-sm text-gray-500">-</TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {folder._count.documents} doc{folder._count.documents !== 1 ? "s" : ""}
                          </TableCell>
                          {showSharingColumn && (
                            <TableCell className="text-xs text-gray-600">
                              {category === "sharedWithMe" ? (
                                <div className="flex flex-wrap gap-1">
                                  {folder.myAccess?.canRead && <Badge variant="secondary" className="bg-blue-50 text-blue-700">view</Badge>}
                                  {folder.myAccess?.canWrite && <Badge variant="secondary" className="bg-amber-50 text-amber-700">edit</Badge>}
                                  {folder.myAccess?.canDelete && <Badge variant="secondary" className="bg-red-50 text-red-700">delete</Badge>}
                                </div>
                              ) : (folder.sharedWith?.length ?? 0) > 0 ? (
                                <div className="space-y-1">
                                  <p className="text-xs text-gray-500">{folder.sharedWith!.length} user{folder.sharedWith!.length !== 1 ? "s" : ""}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {folder.sharedWith!.slice(0, 2).map((entry) => (
                                      <Badge key={entry.userId} variant="secondary" className="bg-gray-100 text-gray-700">
                                        {entry.userName}
                                        {entry.canDelete ? " (D)" : entry.canWrite ? " (E)" : " (V)"}
                                      </Badge>
                                    ))}
                                    {folder.sharedWith!.length > 2 && (
                                      <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                                        +{folder.sharedWith!.length - 2}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400">Not shared</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => navigateTo(folder.id)}
                                className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                                title="Open"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              {canEdit && (
                                <button
                                  onClick={() => setRenameTarget({ id: folder.id, name: folder.name, type: "folder" })}
                                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canShareFolder(folder) && (
                                <button
                                  onClick={() => setShareFolder(folder)}
                                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                                  title="Share"
                                >
                                  <Share2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canDeleteByPermission && (
                                <button
                                  onClick={() => void handleDeleteFolder(folder)}
                                  disabled={deletingId === folder.id || !canDelete}
                                  className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={!canDelete ? "Folder must be empty to delete" : "Delete"}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {docs.map((doc) => {
                      const kind = detectKind(doc);
                      const key = documentSelectionKey(doc.id);
                      const selected = selectedKeys.has(key);
                      const canEdit = canEditDoc(doc);
                      const canDelete = canDeleteDoc(doc);
                      return (
                        <TableRow
                          key={`doc-${doc.id}`}
                          className={cn("cursor-pointer hover:bg-primary/5 group", selected && "bg-[#FE0000]/5")}
                          onClick={() => setViewDoc(doc)}
                          onContextMenu={(e) => openContextMenu(e, { type: "document", doc })}
                        >
                          <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSelection(key)}
                              className="h-4 w-4 rounded border-gray-300"
                              aria-label={`Select document ${doc.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <FileIcon kind={kind} />
                              <span className="text-sm text-gray-700">{doc.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[11px] uppercase bg-gray-100 text-gray-500">{kind}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{displayName(doc.owner)}</TableCell>
                          <TableCell className="text-sm text-gray-500">{formatDate(doc.updatedAt)}</TableCell>
                          <TableCell className="text-sm text-gray-500">{formatBytes(doc.fileSize)}</TableCell>
                          {showSharingColumn && (
                            <TableCell className="text-xs text-gray-600">
                              {category === "sharedWithMe" ? (
                                <div className="flex flex-wrap gap-1">
                                  {doc.myAccess?.canRead && <Badge variant="secondary" className="bg-blue-50 text-blue-700">view</Badge>}
                                  {doc.myAccess?.canWrite && <Badge variant="secondary" className="bg-amber-50 text-amber-700">edit</Badge>}
                                  {doc.myAccess?.canDelete && <Badge variant="secondary" className="bg-red-50 text-red-700">delete</Badge>}
                                </div>
                              ) : (doc.sharedWith?.length ?? 0) > 0 ? (
                                <div className="space-y-1">
                                  <p className="text-xs text-gray-500">{doc.sharedWith!.length} user{doc.sharedWith!.length !== 1 ? "s" : ""}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {doc.sharedWith!.slice(0, 2).map((entry) => (
                                      <Badge key={entry.userId} variant="secondary" className="bg-gray-100 text-gray-700">
                                        {entry.userName}
                                        {entry.canDelete ? " (D)" : entry.canWrite ? " (E)" : " (V)"}
                                      </Badge>
                                    ))}
                                    {doc.sharedWith!.length > 2 && (
                                      <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                                        +{doc.sharedWith!.length - 2}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400">Not shared</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setViewDoc(doc)}
                                className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                                title="View"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              {(doc.fileUrl || doc.content) && (
                                <button
                                  onClick={() => handleDownload(doc)}
                                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                                  title="Download"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canEdit && (
                                <button
                                  onClick={() => setEditDoc(doc)}
                                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => void handleDeleteDoc(doc)}
                                  disabled={deletingId === doc.id}
                                  className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-4 space-y-6">
                  {subFolders.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Folders</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {subFolders.map((folder) => {
                          const key = folderSelectionKey(folder.id);
                          const selected = selectedKeys.has(key);
                          const canEdit = canRenameFolder(folder);
                          const canDeleteByPermission =
                            typeof folder.permission?.canDelete === "boolean"
                              ? folder.permission.canDelete
                              : canManage;
                          const canDelete = canDeleteFolder(folder);
                          return (
                            <button
                              key={`grid-folder-${folder.id}`}
                              type="button"
                              className={cn(
                                "w-full text-left rounded-xl border bg-white p-3 hover:border-[#FE0000]/30 hover:shadow-sm transition",
                                selected && "border-[#FE0000]/40 bg-[#FE0000]/5"
                              )}
                              onClick={() => navigateTo(folder.id)}
                              onContextMenu={(e) => openContextMenu(e, { type: "folder", folder })}
                            >
                              <div className="flex items-start justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleSelection(key)}
                                  className="h-4 w-4 rounded border-gray-300 mt-0.5"
                                  aria-label={`Select folder ${folder.name}`}
                                />
                                <div className="flex items-center gap-1">
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => setRenameTarget({ id: folder.id, name: folder.name, type: "folder" })}
                                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                                      title="Edit"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {canShareFolder(folder) && (
                                    <button
                                      type="button"
                                      onClick={() => setShareFolder(folder)}
                                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                                      title="Share"
                                    >
                                      <Share2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {canDeleteByPermission && (
                                    <button
                                      type="button"
                                      onClick={() => { if (canDelete) void handleDeleteFolder(folder); }}
                                      className={cn("p-1 rounded text-gray-400", canDelete ? "hover:bg-red-50 hover:text-red-500" : "opacity-40")}
                                      title={!canDelete ? "Folder must be empty to delete" : "Delete"}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <Folder className="h-5 w-5 text-yellow-500" />
                                <p className="text-sm font-medium text-gray-800 truncate">{folder.name}</p>
                              </div>
                              <p className="text-xs text-gray-500 mt-2">{folder._count.documents} doc{folder._count.documents !== 1 ? "s" : ""}</p>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {docs.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Documents</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {docs.map((doc) => {
                          const kind = detectKind(doc);
                          const key = documentSelectionKey(doc.id);
                          const selected = selectedKeys.has(key);
                          const canEdit = canEditDoc(doc);
                          const canDelete = canDeleteDoc(doc);
                          return (
                            <button
                              key={`grid-doc-${doc.id}`}
                              type="button"
                              className={cn(
                                "w-full text-left rounded-xl border bg-white p-3 hover:border-[#FE0000]/30 hover:shadow-sm transition",
                                selected && "border-[#FE0000]/40 bg-[#FE0000]/5"
                              )}
                              onClick={() => setViewDoc(doc)}
                              onContextMenu={(e) => openContextMenu(e, { type: "document", doc })}
                            >
                              <div className="flex items-start justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleSelection(key)}
                                  className="h-4 w-4 rounded border-gray-300 mt-0.5"
                                  aria-label={`Select document ${doc.name}`}
                                />
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setViewDoc(doc)}
                                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                                    title="View"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                  {(doc.fileUrl || doc.content) && (
                                    <button
                                      type="button"
                                      onClick={() => handleDownload(doc)}
                                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                                      title="Download"
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => setEditDoc(doc)}
                                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                                      title="Edit"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteDoc(doc)}
                                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                                      title="Delete"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <FileIcon kind={kind} className="h-5 w-5" />
                                <p className="text-sm font-medium text-gray-800 truncate">{doc.name}</p>
                              </div>
                              <div className="mt-2 space-y-1 text-xs text-gray-500">
                                <p>{displayName(doc.owner)}</p>
                                <p>{formatDate(doc.updatedAt)} | {formatBytes(doc.fileSize)}</p>
                                {category === "sharedWithMe" ? (
                                  <div className="flex flex-wrap gap-1 pt-1">
                                    {doc.myAccess?.canRead && <Badge variant="secondary" className="bg-blue-50 text-blue-700">view</Badge>}
                                    {doc.myAccess?.canWrite && <Badge variant="secondary" className="bg-amber-50 text-amber-700">edit</Badge>}
                                    {doc.myAccess?.canDelete && <Badge variant="secondary" className="bg-red-50 text-red-700">delete</Badge>}
                                  </div>
                                ) : (doc.sharedWith?.length ?? 0) > 0 ? (
                                  <div className="pt-1">
                                    <p className="text-[11px] text-gray-500">Shared with {doc.sharedWith!.length} user{doc.sharedWith!.length !== 1 ? "s" : ""}</p>
                                  </div>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {contextMenu && (() => {
        const target = contextMenu.target;
        return (
          <div
            ref={contextMenuRef}
            className="fixed z-[100] w-52 rounded-md border bg-white shadow-lg py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {target.type === "folder" ? (
              <>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => {
                    navigateTo(target.folder.id);
                    setContextMenu(null);
                  }}
                >
                  Open
                </button>
                {canRenameFolder(target.folder) && (
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                      handleCopyItem({ type: "folder", folder: target.folder });
                      setContextMenu(null);
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Copy className="h-4 w-4" />
                      Copy
                    </span>
                  </button>
                )}
                {canWrite && (
                  <button
                    type="button"
                    disabled={!clipboardItem}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-transparent"
                    onClick={() => {
                      void handlePasteIntoFolder(target.folder.id);
                      setContextMenu(null);
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ClipboardPaste className="h-4 w-4" />
                      Paste
                    </span>
                  </button>
                )}
                {canRenameFolder(target.folder) && (
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                      setRenameTarget({
                        id: target.folder.id,
                        name: target.folder.name,
                        type: "folder",
                      });
                      setContextMenu(null);
                    }}
                  >
                    Rename
                  </button>
                )}
                {canShareFolder(target.folder) && (
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                      setShareFolder(target.folder);
                      setContextMenu(null);
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Share2 className="h-4 w-4" />
                      Share
                    </span>
                  </button>
                )}
                {(typeof target.folder.permission?.canDelete === "boolean"
                  ? target.folder.permission.canDelete
                  : canManage) && (
                  <button
                    type="button"
                    disabled={!canDeleteFolder(target.folder)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 disabled:text-gray-300 disabled:hover:bg-transparent"
                    onClick={() => {
                      if (canDeleteFolder(target.folder)) {
                        void handleDeleteFolder(target.folder);
                      }
                      setContextMenu(null);
                    }}
                  >
                    Delete
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => {
                    setViewDoc(target.doc);
                    setContextMenu(null);
                  }}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => {
                    handleCopyItem({ type: "document", doc: target.doc });
                    setContextMenu(null);
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    <Copy className="h-4 w-4" />
                    Copy
                  </span>
                </button>
                {canWrite && (
                  <button
                    type="button"
                    disabled={!clipboardItem}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-transparent"
                    onClick={() => {
                      void handlePasteIntoFolder(currentFolderId);
                      setContextMenu(null);
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ClipboardPaste className="h-4 w-4" />
                      Paste
                    </span>
                  </button>
                )}
                {(target.doc.fileUrl || target.doc.content) && (
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                      handleDownload(target.doc);
                      setContextMenu(null);
                    }}
                  >
                    Download
                  </button>
                )}
                {canEditDoc(target.doc) && (
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                      setEditDoc(target.doc);
                      setContextMenu(null);
                    }}
                  >
                    Edit
                  </button>
                )}
                {canEditDoc(target.doc) && (
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                    setRenameTarget({
                      id: target.doc.id,
                      name: target.doc.name,
                      type: "file",
                    });
                    setContextMenu(null);
                  }}
                >
                  Rename
                </button>
              )}
              {canShareDoc(target.doc) && (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => {
                    setShareDoc(target.doc);
                    setContextMenu(null);
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    <Share2 className="h-4 w-4" />
                    Share
                  </span>
                </button>
              )}
              {canDeleteDoc(target.doc) && (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600"
                    onClick={() => {
                      void handleDeleteDoc(target.doc);
                      setContextMenu(null);
                    }}
                  >
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        );
      })()}

      <NewFolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onCreated={handleFolderCreated}
        parentId={currentFolderId}
      />
      <NewDocumentDialog
        open={newDocOpen}
        onClose={() => setNewDocOpen(false)}
        onCreated={handleDocCreated}
        folderId={currentFolderId}
      />
      <EditDocumentDialog
        open={!!editDoc}
        onClose={() => setEditDoc(null)}
        onSaved={handleDocUpdated}
        doc={editDoc}
      />
      <ShareFolderDialog
        open={!!shareFolder}
        onClose={() => setShareFolder(null)}
        onSaved={handleFolderShareUpdated}
        folder={shareFolder}
      />
      <ShareDocumentDialog
        open={!!shareDoc}
        onClose={() => setShareDoc(null)}
        onSaved={handleShareUpdated}
        doc={shareDoc}
      />
      <BulkShareDialog
        open={bulkShareOpen}
        onClose={() => setBulkShareOpen(false)}
        docs={selectedDocs}
        onSaved={handleBulkShareSaved}
      />
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={handleDocCreated}
        folderId={currentFolderId}
      />
      <RenameDialog
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        onRenamed={handleRenamed}
        item={renameTarget}
      />
      <ViewDocumentDialog
        open={!!viewDoc}
        onClose={() => setViewDoc(null)}
        doc={viewDoc}
      />
    </div>
  );
}

