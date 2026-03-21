"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Plus,
  Search,
  RefreshCw,
  GitMerge,
  CreditCard,
  AlertCircle,
  ArrowUpCircle,
  ArrowDownCircle,
  Settings,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type BankAccount = {
  id: string;
  name: string;
  accountNumber: string;
  bankName: string;
  currency: string;
  balance: number;
  _count: { transactions: number };
};

type BankTransaction = {
  id: string;
  accountId: string;
  type: string;
  amount: number;
  currency: string;
  description: string | null;
  status: string;
  transactionAt: string;
  account: {
    id: string;
    name: string;
    accountNumber: string;
    bankName: string;
    currency: string;
  };
};

const statusConfig: Record<string, string> = {
  recognized: "bg-green-100 text-green-700",
  unrecognized: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
};

export default function EBankPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [accForm, setAccForm] = useState({ name: "", accountNumber: "", bankName: "", currency: "USD", provider: "manual" });
  const [activeAccount, setActiveAccount] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let mounted = true;

    Promise.all([fetch("/api/ebank/accounts"), fetch("/api/ebank/transactions?limit=600")])
      .then(async ([accountsRes, txRes]) => {
        if (!accountsRes.ok) throw new Error("Failed to load bank accounts");
        if (!txRes.ok) throw new Error("Failed to load bank transactions");
        const accountsData = (await accountsRes.json()) as BankAccount[];
        const txData = (await txRes.json()) as BankTransaction[];
        if (!mounted) return;
        setAccounts(Array.isArray(accountsData) ? accountsData : []);
        setTransactions(Array.isArray(txData) ? txData : []);
        if (Array.isArray(accountsData) && accountsData.length > 0) {
          setActiveAccount(accountsData[0].id);
        }
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load bank data");
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
    return transactions.filter((transaction) => {
      const matchesAccount = !activeAccount || transaction.accountId === activeAccount;
      const matchesSearch = !query || (transaction.description ?? "").toLowerCase().includes(query);
      return matchesAccount && matchesSearch;
    });
  }, [transactions, activeAccount, searchQuery]);

  const inflow = filtered
    .filter((transaction) => transaction.type === "credit")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const outflow = filtered
    .filter((transaction) => transaction.type !== "credit")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const unmatched = filtered.filter((transaction) => transaction.status === "unrecognized").length;

  function openNewAccount() { setAccForm({ name: "", accountNumber: "", bankName: "", currency: "USD", provider: "manual" }); setDialogOpen(true); }

  async function saveAccount() {
    if (!accForm.name.trim() || !accForm.accountNumber.trim() || !accForm.bankName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ebank/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accForm),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const created: BankAccount = await res.json();
      setAccounts(prev => [...prev, created]);
      setDialogOpen(false);
      toast.success("Bank account created");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex h-full">
      <div className="w-64 border-r bg-white flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">E-Bank</h2>
        </div>
        <div className="flex-1 p-3 space-y-1 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Accounts</p>
          {accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => setActiveAccount(account.id)}
              className={cn(
                "w-full text-left px-3 py-3 rounded-lg transition-colors",
                activeAccount === account.id
                  ? "bg-[#FE0000]/5 border border-[#FE0000]/30"
                  : "hover:bg-gray-50 border border-transparent"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="h-4 w-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-700 truncate">
                  {account.name} ••••{account.accountNumber.slice(-4)}
                </span>
              </div>
              <p
                className={cn(
                  "text-base font-bold",
                  Number(account.balance) >= 0 ? "text-gray-900" : "text-red-600"
                )}
              >
                {account.currency} {Number(account.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </button>
          ))}
          <div className="pt-2 border-t mt-3 space-y-0.5">
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-100">
              <AlertCircle className="h-4 w-4 text-red-400" />
              Unrecognized Transactions
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                {unmatched}
              </span>
            </button>
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-100">
              <Settings className="h-4 w-4 text-gray-400" />
              Routing Rules
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b bg-white px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-[#FE0000] hover:bg-[#cc0000] text-white" onClick={openNewAccount}>
              <Plus className="h-4 w-4 mr-1" />New Account
            </Button>
            <Button size="sm" variant="outline">
              <RefreshCw className="h-4 w-4 mr-1" />
              Sync
            </Button>
            <Button size="sm" variant="outline">
              <GitMerge className="h-4 w-4 mr-1" />
              Match Transactions
            </Button>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search transactions..."
              className="pl-8 h-8 text-sm"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="px-6 py-3 grid grid-cols-3 gap-3 border-b bg-gray-50">
          <Card className="bg-white">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-gray-500 font-medium">Total Inflow</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-lg font-bold text-green-600">+{inflow.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-gray-500 font-medium">Total Outflow</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-lg font-bold text-red-600">-{outflow.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-gray-500 font-medium">Unmatched Transactions</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-lg font-bold text-yellow-600">{unmatched}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 overflow-auto">
          <Card className="rounded-none border-0 shadow-none">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 text-sm text-gray-500">Loading bank data...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 hover:bg-gray-50">
                      <TableHead className="pl-6 w-28">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-20">Type</TableHead>
                      <TableHead className="w-32 text-right">Amount</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="w-48">Account</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((transaction) => (
                      <TableRow key={transaction.id} className="cursor-pointer hover:bg-primary/5">
                        <TableCell className="pl-6 text-sm text-gray-500">
                          {new Date(transaction.transactionAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-sm text-gray-800">
                          {transaction.description || "No description"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {transaction.type === "credit" ? (
                              <ArrowDownCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <ArrowUpCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span
                              className={cn(
                                "text-xs font-medium capitalize",
                                transaction.type === "credit" ? "text-green-600" : "text-red-600"
                              )}
                            >
                              {transaction.type}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              "text-sm font-semibold",
                              transaction.type === "credit" ? "text-green-600" : "text-red-600"
                            )}
                          >
                            {transaction.type === "credit" ? "+" : "-"}
                            {Number(transaction.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn("text-xs capitalize", statusConfig[transaction.status] ?? "bg-gray-100 text-gray-600")}
                          >
                            {transaction.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {transaction.account.name} ••••{transaction.account.accountNumber.slice(-4)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {!loading && filtered.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No transactions found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Bank Account</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Account Name *</Label><Input value={accForm.name} onChange={e => setAccForm(p => ({...p, name: e.target.value}))} /></div>
            <div className="space-y-1"><Label>Account Number *</Label><Input value={accForm.accountNumber} onChange={e => setAccForm(p => ({...p, accountNumber: e.target.value}))} /></div>
            <div className="space-y-1"><Label>Bank Name *</Label><Input value={accForm.bankName} onChange={e => setAccForm(p => ({...p, bankName: e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Currency</Label>
                <Select value={accForm.currency} onValueChange={v => setAccForm(p => ({...p, currency: v ?? "USD"}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="AED">AED</SelectItem><SelectItem value="GBP">GBP</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Provider</Label>
                <Select value={accForm.provider} onValueChange={v => setAccForm(p => ({...p, provider: v ?? "manual"}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="manual">Manual</SelectItem><SelectItem value="webmoney">WebMoney</SelectItem><SelectItem value="paypal">PayPal</SelectItem><SelectItem value="rbk">RBK Money</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#FE0000] hover:bg-[#cc0000] text-white" onClick={() => void saveAccount()} disabled={saving || !accForm.name.trim() || !accForm.accountNumber.trim()}>
              {saving ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


