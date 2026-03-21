"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  CheckSquare,
  FileText,
  Mail,
  Building2,
  Headphones,
  Users,
  FolderOpen,
  FolderKanban,
  MessageSquare,
  Calendar,
  ChevronRight,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  module:
    | "tasks"
    | "documents"
    | "email"
    | "clients"
    | "contacts"
    | "servicedesk"
    | "projects"
    | "board"
    | "calendar"
    | string;
  title: string;
  snippet: string;
  date: string;
  link: string;
};

const moduleFilters = [
  { value: "all", label: "All Modules" },
  { value: "tasks", label: "Tasks" },
  { value: "documents", label: "Documents" },
  { value: "email", label: "Emails" },
  { value: "clients", label: "Organizations" },
  { value: "leads", label: "Leads" },
  { value: "contacts", label: "Contacts" },
  { value: "livechat", label: "Live Chat" },
  { value: "servicedesk", label: "Service Desk" },
  { value: "projects", label: "Projects" },
  { value: "board", label: "Board" },
  { value: "calendar", label: "Calendar" },
];

const quickSearches = ["Q1 report", "Acme Corporation", "login bug", "API documentation", "team meeting"];

const moduleMeta: Record<string, { icon: React.ComponentType<{ className?: string }>; iconColor: string; iconBg: string; label: string }> = {
  tasks: { icon: CheckSquare, iconColor: "text-primary", iconBg: "bg-primary/10", label: "Tasks" },
  documents: { icon: FileText, iconColor: "text-red-600", iconBg: "bg-red-50", label: "Documents" },
  email: { icon: Mail, iconColor: "text-purple-600", iconBg: "bg-purple-50", label: "Email" },
  clients: { icon: Building2, iconColor: "text-indigo-600", iconBg: "bg-indigo-50", label: "Organizations" },
  leads: { icon: FolderKanban, iconColor: "text-emerald-600", iconBg: "bg-emerald-50", label: "Leads" },
  contacts: { icon: Users, iconColor: "text-teal-600", iconBg: "bg-teal-50", label: "Contacts" },
  livechat: { icon: MessageSquare, iconColor: "text-cyan-600", iconBg: "bg-cyan-50", label: "Live Chat" },
  servicedesk: { icon: Headphones, iconColor: "text-orange-600", iconBg: "bg-orange-50", label: "Service Desk" },
  projects: { icon: FolderOpen, iconColor: "text-green-600", iconBg: "bg-green-50", label: "Projects" },
  board: { icon: MessageSquare, iconColor: "text-yellow-600", iconBg: "bg-yellow-50", label: "Board" },
  calendar: { icon: Calendar, iconColor: "text-pink-600", iconBg: "bg-pink-50", label: "Calendar" },
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  async function performSearch(nextQuery: string = query, nextModule: string = moduleFilter) {
    const trimmed = nextQuery.trim();
    if (!trimmed) return;

    setSearching(true);
    setError(null);
    setHasSearched(true);
    const started = performance.now();

    try {
      const params = new URLSearchParams({ q: trimmed, limit: "80" });
      if (nextModule !== "all") params.set("module", nextModule);
      const response = await fetch(`/api/search?${params.toString()}`);
      if (!response.ok) throw new Error("Search request failed");
      const data = (await response.json()) as { query: string; results: SearchResult[] };
      setResults(Array.isArray(data.results) ? data.results : []);
      setElapsedMs(Math.round(performance.now() - started));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
      setElapsedMs(null);
    } finally {
      setSearching(false);
    }
  }

  const filteredByModule = useMemo(() => {
    if (moduleFilter === "all") return results;
    return results.filter((result) => result.module === moduleFilter);
  }, [results, moduleFilter]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className={cn("bg-white border-b transition-all", hasSearched ? "py-4 px-6" : "py-12 px-6")}>
        {!hasSearched && (
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-[#FE0000] text-white mb-4">
              <Search className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Search Everything</h1>
            <p className="text-gray-500 text-sm">Find tasks, documents, emails, contacts and more across all modules</p>
          </div>
        )}

        <div
          className={cn(
            "flex items-center gap-3",
            !hasSearched ? "mx-auto max-w-2xl" : "mx-auto w-full max-w-4xl flex-wrap sm:flex-nowrap"
          )}
        >
          <div className={cn("relative", hasSearched ? "w-full sm:w-[420px] sm:flex-none" : "flex-1")}>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              placeholder="Search tasks, documents, emails, contacts..."
              className={cn("pl-10 text-sm", hasSearched ? "h-9" : "h-12 text-base")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void performSearch();
              }}
              autoFocus
            />
          </div>
          {hasSearched && (
            <Select
              value={moduleFilter}
              onValueChange={(value) => {
                const nextValue = value ?? "all";
                setModuleFilter(nextValue);
                if (hasSearched && query.trim()) {
                  void performSearch(query, nextValue);
                }
              }}
            >
              <SelectTrigger className="h-9 w-full sm:w-44 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {moduleFilters.map((filter) => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            onClick={() => void performSearch()}
            className={cn(hasSearched ? "h-9 w-full sm:w-auto" : "h-12 px-6")}
            disabled={searching}
          >
            <Search className="h-4 w-4 mr-1.5" />
            {searching ? "Searching..." : "Search"}
          </Button>
        </div>

        {!hasSearched && (
          <div className="max-w-2xl mx-auto mt-4">
            <p className="text-xs text-gray-400 mb-2">Quick searches:</p>
            <div className="flex flex-wrap gap-2">
              {quickSearches.map((quickSearch) => (
                <button
                  key={quickSearch}
                  onClick={() => {
                    setQuery(quickSearch);
                    setHasSearched(true);
                    void performSearch(quickSearch, moduleFilter);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-[#FE0000]/10 hover:text-[#FE0000] transition-colors"
                >
                  {quickSearch}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {hasSearched ? (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600">
                Found <span className="font-semibold text-gray-900">{filteredByModule.length} results</span> for &quot;{query}&quot;
              </p>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="h-3.5 w-3.5" />
                {elapsedMs !== null ? `${elapsedMs}ms` : "—"}
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              {filteredByModule.map((result) => {
                const meta = moduleMeta[result.module] ?? moduleMeta.tasks;
                const Icon = meta.icon;
                return (
                  <Card key={`${result.module}-${result.id}`} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={cn("p-2 rounded-lg shrink-0", meta.iconBg)}>
                          <Icon className={cn("h-4 w-4", meta.iconColor)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-gray-900 hover:text-primary">{result.title}</h3>
                            <span className="text-xs text-gray-400 shrink-0">
                              {new Date(result.date).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mb-2 line-clamp-2">{result.snippet || "No preview available"}</p>
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <span className="text-primary font-medium">{meta.label}</span>
                            <ChevronRight className="h-3 w-3" />
                            <span>{result.link}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {filteredByModule.length === 0 && !searching && (
              <div className="text-center py-16 text-gray-400">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No results found</p>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Browse Modules</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Tasks", icon: CheckSquare, color: "text-primary", bg: "bg-primary/10" },
                { label: "Documents", icon: FileText, color: "text-red-600", bg: "bg-red-50" },
                { label: "Emails", icon: Mail, color: "text-purple-600", bg: "bg-purple-50" },
                { label: "Organizations", icon: Building2, color: "text-indigo-600", bg: "bg-indigo-50" },
                { label: "Leads", icon: FolderKanban, color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Contacts", icon: Users, color: "text-teal-600", bg: "bg-teal-50" },
                { label: "Live Chat", icon: MessageSquare, color: "text-cyan-600", bg: "bg-cyan-50" },
                { label: "Service Desk", icon: Headphones, color: "text-orange-600", bg: "bg-orange-50" },
                { label: "Projects", icon: FolderOpen, color: "text-green-600", bg: "bg-green-50" },
                { label: "Board", icon: MessageSquare, color: "text-yellow-600", bg: "bg-yellow-50" },
                { label: "Calendar", icon: Calendar, color: "text-pink-600", bg: "bg-pink-50" },
              ].map((moduleItem) => (
                <Card key={moduleItem.label} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", moduleItem.bg)}>
                      <moduleItem.icon className={cn("h-5 w-5", moduleItem.color)} />
                    </div>
                    <span className="text-sm font-medium text-gray-700">{moduleItem.label}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
