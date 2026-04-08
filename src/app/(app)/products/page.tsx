"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Upload, Download, Package, Tag, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ProductCategory = {
  id: string;
  name: string;
  _count: { products: number };
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  currency: string;
  stock: number;
  isActive: boolean;
  category: { id: string; name: string } | null;
};

const statusConfig: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-500",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: "", sku: "", price: "0", currency: "USD", stock: "0", description: "", categoryId: "", isActive: true });
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    Promise.all([fetch("/api/products?limit=500"), fetch("/api/products/categories")])
      .then(async ([productsRes, categoriesRes]) => {
        if (!productsRes.ok) throw new Error("Failed to load products");
        if (!categoriesRes.ok) throw new Error("Failed to load product categories");
        const productsData = (await productsRes.json()) as Product[];
        const categoriesData = (await categoriesRes.json()) as ProductCategory[];
        if (!mounted) return;
        setProducts(Array.isArray(productsData) ? productsData : []);
        setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load products");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const categoryFilters = useMemo(() => {
    const base = [{ id: "all", label: "All Products", count: products.length }];
    return base.concat(
      categories.map((category) => ({
        id: category.id,
        label: category.name,
        count: category._count.products,
      }))
    );
  }, [categories, products.length]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = activeCategory === "all" || product.category?.id === activeCategory;
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        (product.sku ?? "").toLowerCase().includes(query);
      const status = product.isActive ? "active" : "inactive";
      const matchesStatus = statusFilter === "all" || statusFilter === status;
      return matchesCategory && matchesSearch && matchesStatus;
    });
  }, [products, activeCategory, searchQuery, statusFilter]);

  const emptyForm = { name: "", sku: "", price: "0", currency: "USD", stock: "0", description: "", categoryId: "", isActive: true };

  function openNew() { setEditProduct(null); setForm(emptyForm); setDialogOpen(true); }
  function openEdit(p: Product) {
    setEditProduct(p);
    setForm({ name: p.name, sku: p.sku ?? "", price: String(p.price), currency: p.currency, stock: String(p.stock), description: "", categoryId: p.category?.id ?? "", isActive: p.isActive });
    setDialogOpen(true);
  }

  async function saveProduct() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = editProduct ? `/api/products/${editProduct.id}` : "/api/products";
      const method = editProduct ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, price: parseFloat(form.price) || 0, stock: parseInt(form.stock) || 0, categoryId: form.categoryId || null }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const saved: Product = await res.json();
      setProducts(prev => editProduct ? prev.map(p => p.id === saved.id ? saved : p) : [saved, ...prev]);
      setDialogOpen(false);
      toast.success(editProduct ? "Product updated" : "Product created");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function deleteProduct(product: Product) {
    setDeletingProductId(product.id);
    try {
      const response = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to delete");
      }
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      setDeleteTarget(null);
      toast.success("Product deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete");
    } finally {
      setDeletingProductId(null);
    }
  }

  return (
    <div className="flex h-full">
      <div className="w-56 border-r bg-white flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Products</h2>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {categoryFilters.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                activeCategory === category.id
                  ? "bg-[#AA8038]/10 text-[#AA8038] font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <div className="flex items-center gap-2.5">
                {category.id === "all" ? <Package className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
                {category.label}
              </div>
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full font-medium",
                  activeCategory === category.id ? "bg-[#AA8038]/15 text-[#AA8038]" : "bg-gray-100 text-gray-500"
                )}
              >
                {category.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b bg-white px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-[#AA8038] hover:bg-[#CC8500] text-white" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />New Product
            </Button>
            <Button size="sm" variant="outline">
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button size="sm" variant="outline">
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? "all")}>
              <SelectTrigger className="h-8 w-32 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search products..."
                className="pl-8 h-8 text-sm"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <Card className="rounded-none border-0 shadow-none">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 text-sm text-gray-500">Loading products...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 hover:bg-gray-50">
                      <TableHead className="pl-6">Name</TableHead>
                      <TableHead className="w-36">SKU</TableHead>
                      <TableHead className="w-28">Category</TableHead>
                      <TableHead className="w-28 text-right">Price</TableHead>
                      <TableHead className="w-20 text-right">Stock</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((product) => {
                      const status = product.isActive ? "active" : "inactive";
                      return (
                        <TableRow key={product.id} className="hover:bg-gray-50 group">
                          <TableCell className="pl-6">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Package className="h-4 w-4 text-primary" />
                              </div>
                              <span className="text-sm font-medium text-gray-800">{product.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-gray-500">{product.sku || "—"}</TableCell>
                          <TableCell className="text-sm text-gray-600">{product.category?.name || "Uncategorized"}</TableCell>
                          <TableCell className="text-sm font-medium text-gray-800 text-right">
                            {product.currency} {Number(product.price).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-sm text-right">
                            <span className={cn("font-medium", product.stock < 10 ? "text-red-600" : "text-gray-700")}>
                              {product.stock}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={cn("text-xs capitalize", statusConfig[status])}>
                              {status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                              <button className="p-1 hover:text-primary" onClick={() => openEdit(product)}><Pencil className="h-3.5 w-3.5" /></button>
                              <button className="p-1 hover:text-red-600 disabled:opacity-50" onClick={() => setDeleteTarget(product)} disabled={deletingProductId === product.id}><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              {!loading && filtered.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No products found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editProduct ? "Edit Product" : "New Product"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Name *</Label><input className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} /></div>
            <div className="space-y-1"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>SKU</Label><input className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none" value={form.sku} onChange={e => setForm(p => ({...p, sku: e.target.value}))} /></div>
              <div className="space-y-1"><Label>Stock</Label><input type="number" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none" value={form.stock} onChange={e => setForm(p => ({...p, stock: e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Price</Label><input type="number" step="0.01" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none" value={form.price} onChange={e => setForm(p => ({...p, price: e.target.value}))} /></div>
              <div className="space-y-1"><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(p => ({...p, currency: v ?? "USD"}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="AED">AED</SelectItem><SelectItem value="GBP">GBP</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2"><input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm(p => ({...p, isActive: e.target.checked}))} /><Label htmlFor="isActive">Active</Label></div>
          </div>
          <DialogFooter>
            <button className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent" onClick={() => setDialogOpen(false)}>Cancel</button>
            <button className="inline-flex items-center justify-center rounded-md bg-[#AA8038] px-4 py-2 text-sm font-medium text-white hover:bg-[#CC8500] disabled:opacity-50" onClick={() => void saveProduct()} disabled={saving || !form.name.trim()}>
              {saving ? "Saving..." : editProduct ? "Update" : "Create"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title="Delete product?"
        description={deleteTarget ? `This will permanently delete "${deleteTarget.name}".` : ""}
        confirmLabel="Delete"
        loading={Boolean(deleteTarget && deletingProductId === deleteTarget.id)}
        onConfirm={() => {
          if (!deleteTarget) return;
          return deleteProduct(deleteTarget);
        }}
      />
    </div>
  );
}
