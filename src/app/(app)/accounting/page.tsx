"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, BookOpen, FileText, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type AccountingBook = {
  id: string;
  name: string;
  status: string;
  currency: string;
  createdAt: string;
  organization: { id: string; name: string } | null;
  _count: { contracts: number };
};

const statusConfig: Record<string, string> = {
  open: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-500",
};

const currencyFlags: Record<string, string> = {
  USD: "US",
  EUR: "EU",
  GBP: "UK",
  AED: "AE",
};

function BooksTable({ data }: { data: AccountingBook[] }) {
  return (
    <Card className="rounded-none border-0 shadow-none">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead className="pl-6">Name</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead className="w-24">Currency</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-32 text-right">Contracts</TableHead>
              <TableHead className="w-28">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((book) => (
              <TableRow key={book.id} className="cursor-pointer hover:bg-primary/5">
                <TableCell className="pl-6">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-green-50 flex items-center justify-center">
                      <BookOpen className="h-4 w-4 text-green-600" />
                    </div>
                    <span className="text-sm font-medium text-gray-800">{book.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-gray-600">{book.organization?.name || "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                      {currencyFlags[book.currency] ?? "NA"}
                    </span>
                    <span className="text-sm text-gray-700">{book.currency}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={cn("text-xs capitalize", statusConfig[book.status] ?? "bg-gray-100 text-gray-600")}>
                    {book.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-right font-medium text-gray-700">{book._count.contracts}</TableCell>
                <TableCell className="text-sm text-gray-500">{new Date(book.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No books found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AccountingPage() {
  const [books, setBooks] = useState<AccountingBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bookForm, setBookForm] = useState({ name: "", description: "", currency: "USD" });
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let mounted = true;

    fetch("/api/accounting/books?limit=500")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load accounting books");
        return response.json();
      })
      .then((data: AccountingBook[]) => {
        if (!mounted) return;
        setBooks(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load accounting books");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return books;
    return books.filter(
      (book) =>
        book.name.toLowerCase().includes(query) ||
        (book.organization?.name ?? "").toLowerCase().includes(query)
    );
  }, [books, searchQuery]);

  const openBooks = filtered.filter((book) => book.status === "open");
  const closedBooks = filtered.filter((book) => book.status !== "open");

  function openNewBook() { setBookForm({ name: "", description: "", currency: "USD" }); setDialogOpen(true); }

  async function saveBook() {
    if (!bookForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/accounting/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookForm),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const created: AccountingBook = await res.json();
      setBooks(prev => [created, ...prev]);
      setDialogOpen(false);
      toast.success("Book created");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Accounting
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage accounting books and financial records</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-[#AA8038] hover:bg-[#CC8500] text-white" onClick={openNewBook}>
              <Plus className="h-4 w-4 mr-1" />New Book
            </Button>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search books..."
                className="pl-8 h-8 text-sm"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>
        </div>
        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="open" className="h-full flex flex-col">
          <div className="border-b bg-white px-6">
            <TabsList className="h-10 bg-transparent p-0 gap-0 border-none rounded-none">
              {[
                { value: "open", label: "Open Books", icon: BookOpen },
                { value: "closed", label: "Closed Books", icon: BookOpen },
                { value: "templates", label: "Templates", icon: FileText },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 h-10 text-sm"
                >
                  <tab.icon className="h-4 w-4 mr-1.5" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="open" className="flex-1 overflow-auto mt-0">
            {loading ? <div className="p-6 text-sm text-gray-500">Loading books...</div> : <BooksTable data={openBooks} />}
          </TabsContent>

          <TabsContent value="closed" className="flex-1 overflow-auto mt-0">
            {loading ? <div className="p-6 text-sm text-gray-500">Loading books...</div> : <BooksTable data={closedBooks} />}
          </TabsContent>

          <TabsContent value="templates" className="flex-1 overflow-auto mt-0 bg-gray-50">
            <div className="p-6 text-sm text-gray-500">
              Contract templates are represented by accounting contracts and can be managed from the API layer.
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Accounting Book</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Name *</Label><Input value={bookForm.name} onChange={e => setBookForm(p => ({...p, name: e.target.value}))} /></div>
            <div className="space-y-1"><Label>Description</Label><Input value={bookForm.description} onChange={e => setBookForm(p => ({...p, description: e.target.value}))} /></div>
            <div className="space-y-1"><Label>Currency</Label>
              <Select value={bookForm.currency} onValueChange={v => setBookForm(p => ({...p, currency: v ?? "USD"}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="AED">AED</SelectItem><SelectItem value="GBP">GBP</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#AA8038] hover:bg-[#CC8500] text-white" onClick={() => void saveBook()} disabled={saving || !bookForm.name.trim()}>
              {saving ? "Creating..." : "Create Book"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


