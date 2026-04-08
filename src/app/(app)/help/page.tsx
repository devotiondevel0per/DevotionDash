"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpenCheck, FileText, GraduationCap, LifeBuoy, Search } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import type { ModuleId } from "@/lib/permissions";
import { HELP_TOPICS, MODULE_LABEL, TOPIC_TYPE_LABEL, type HelpTopicType } from "@/lib/help-content";

export default function HelpPage() {
  const { access, loading } = usePermissions();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | HelpTopicType>("all");
  const [moduleFilter, setModuleFilter] = useState<"all" | ModuleId>("all");

  const visibleTopics = useMemo(() => {
    if (!access) return [];
    return HELP_TOPICS.filter((topic) => access.isAdmin || access.permissions[topic.module]?.read);
  }, [access]);

  const moduleOptions = useMemo(() => {
    return Array.from(new Set(visibleTopics.map((topic) => topic.module))).sort((a, b) =>
      MODULE_LABEL[a].localeCompare(MODULE_LABEL[b])
    );
  }, [visibleTopics]);

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleTopics.filter((topic) => {
      if (typeFilter !== "all" && topic.type !== typeFilter) return false;
      if (moduleFilter !== "all" && topic.module !== moduleFilter) return false;
      if (!q) return true;
      const errorSearchText = topic.errorDetails
        .map((error) => `${error.errorNumber} ${error.code} ${error.title} ${error.meaning} ${error.commonCause}`)
        .join(" ")
        .toLowerCase();
      const articleSearchText = topic.articleSections
        .flatMap((section) => [section.heading, ...section.paragraphs, ...(section.checklist ?? []), ...(section.warnings ?? [])])
        .join(" ")
        .toLowerCase();
      const flowSearchText = `${topic.whenToUse.join(" ")} ${topic.steps.join(" ")} ${topic.tips.join(" ")}`.toLowerCase();
      return (
        topic.title.toLowerCase().includes(q) ||
        topic.summary.toLowerCase().includes(q) ||
        topic.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        articleSearchText.includes(q) ||
        flowSearchText.includes(q) ||
        errorSearchText.includes(q)
      );
    });
  }, [moduleFilter, query, typeFilter, visibleTopics]);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="border-b bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#AA8038]/10 text-[#AA8038]">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Help Center</h1>
              <p className="text-sm text-slate-600">
                Detailed documentation, guides, and tutorials with error-number reference.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_180px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search help topics..."
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter((value as "all" | HelpTopicType) ?? "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Topic type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="documentation">Documentation</SelectItem>
                <SelectItem value="guide">Guides</SelectItem>
                <SelectItem value="tutorial">Tutorials</SelectItem>
              </SelectContent>
            </Select>
            <Select value={moduleFilter} onValueChange={(value) => setModuleFilter((value as "all" | ModuleId) ?? "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Visible Modules</SelectItem>
                {moduleOptions.map((moduleId) => (
                  <SelectItem key={moduleId} value={moduleId}>
                    {MODULE_LABEL[moduleId]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6">
        {loading ? (
          <Card>
            <CardContent className="p-6 text-sm text-slate-600">Loading help topics...</CardContent>
          </Card>
        ) : filteredTopics.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-sm font-medium text-slate-700">No help topics available for this filter.</p>
              <p className="mt-1 text-xs text-slate-500">
                Try changing filters, or request access to additional modules from your administrator.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredTopics.map((topic) => (
              <Card key={topic.id} className="border-slate-200 bg-white">
                <CardHeader className="pb-2">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {TOPIC_TYPE_LABEL[topic.type]}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {MODULE_LABEL[topic.module]}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {topic.errorDetails.length} errors
                    </Badge>
                  </div>
                  <CardTitle className="text-base text-slate-900">{topic.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <p className="text-sm text-slate-600">{topic.summary}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {topic.tags.map((tag) => (
                      <span
                        key={`${topic.id}-${tag}`}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/help/${topic.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-[#B07507] hover:text-[#915E00]"
                    >
                      {topic.type === "tutorial" ? (
                        <GraduationCap className="h-4 w-4" />
                      ) : topic.type === "guide" ? (
                        <BookOpenCheck className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      Open detailed article
                    </Link>
                    <Link
                      href={topic.relatedHref}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700"
                    >
                      Open module
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
