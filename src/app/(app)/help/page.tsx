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

type HelpTopicType = "documentation" | "guide" | "tutorial";

type HelpTopic = {
  id: string;
  title: string;
  summary: string;
  type: HelpTopicType;
  module: ModuleId;
  href: string;
  tags: string[];
};

const MODULE_LABEL: Record<ModuleId, string> = {
  home: "Home",
  tasks: "Tasks",
  projects: "Projects",
  documents: "Documents",
  email: "E-Mail",
  board: "Board",
  leads: "Leads",
  clients: "Organizations",
  contacts: "Contacts",
  team: "Team",
  calendar: "Calendar",
  chat: "Chat",
  livechat: "Live Chat",
  servicedesk: "Ticket Desk",
  products: "Products",
  accounting: "Accounting",
  ebank: "e-Bank",
  telephony: "Telephony",
  search: "Search",
  help: "Help",
  administration: "Administration",
};

const TOPIC_TYPE_LABEL: Record<HelpTopicType, string> = {
  documentation: "Documentation",
  guide: "Guide",
  tutorial: "Tutorial",
};

const HELP_TOPICS: HelpTopic[] = [
  {
    id: "getting-started",
    title: "Getting Started With Teamwox",
    summary: "Overview of navigation, global search, notifications, and profile settings.",
    type: "documentation",
    module: "help",
    href: "/home",
    tags: ["onboarding", "basics"],
  },
  {
    id: "tasks-lifecycle",
    title: "Task Lifecycle and Stage Management",
    summary: "How to create tasks, move between stages, assign users, and close work correctly.",
    type: "guide",
    module: "tasks",
    href: "/tasks",
    tags: ["workflow", "stages"],
  },
  {
    id: "projects-kanban",
    title: "Project Boards and Project Tasks",
    summary: "Best practices for project structure, kanban usage, and progress tracking.",
    type: "tutorial",
    module: "projects",
    href: "/projects",
    tags: ["kanban", "planning"],
  },
  {
    id: "documents-sharing",
    title: "Document Upload, Sharing, and Access",
    summary: "Manage folders, permissions, previews, and secure sharing links.",
    type: "documentation",
    module: "documents",
    href: "/documents",
    tags: ["sharing", "permissions"],
  },
  {
    id: "chat-collaboration",
    title: "Internal Chat Collaboration",
    summary: "Create dialogs, groups, and handle links or media in conversations.",
    type: "guide",
    module: "chat",
    href: "/chat",
    tags: ["dialogs", "teams"],
  },
  {
    id: "livechat-agent",
    title: "Live Chat Agent Operations",
    summary: "Queue handling, assignment flow, follow-up, and transcript controls.",
    type: "tutorial",
    module: "livechat",
    href: "/livechat",
    tags: ["queue", "support"],
  },
  {
    id: "servicedesk-requests",
    title: "Ticket Desk Request Handling",
    summary: "Manage service desk requests, priorities, and SLA-friendly updates.",
    type: "guide",
    module: "servicedesk",
    href: "/servicedesk",
    tags: ["tickets", "sla"],
  },
  {
    id: "crm-leads",
    title: "Leads and Pipeline Flow",
    summary: "Lead capture, stage progression, and conversion workflow.",
    type: "documentation",
    module: "leads",
    href: "/leads",
    tags: ["crm", "pipeline"],
  },
  {
    id: "organizations-contacts",
    title: "Organizations and Contacts Structure",
    summary: "Relationship model between organizations, contacts, and account ownership.",
    type: "documentation",
    module: "clients",
    href: "/clients",
    tags: ["crm", "data model"],
  },
  {
    id: "administration-permissions",
    title: "Roles, Permissions, and Module Access",
    summary: "Configure role templates, overrides, and secure access boundaries.",
    type: "guide",
    module: "administration",
    href: "/administration",
    tags: ["rbac", "security"],
  },
  {
    id: "search-productivity",
    title: "Cross-Module Search Productivity",
    summary: "Use global search filters and query patterns to find records quickly.",
    type: "tutorial",
    module: "search",
    href: "/search",
    tags: ["search", "efficiency"],
  },
];

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
      return (
        topic.title.toLowerCase().includes(q) ||
        topic.summary.toLowerCase().includes(q) ||
        topic.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [moduleFilter, query, typeFilter, visibleTopics]);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="border-b bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FE0000]/10 text-[#FE0000]">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Help Center</h1>
              <p className="text-sm text-slate-600">
                Documentation, guides, and tutorials filtered by your module permissions.
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
                  <Link
                    href={topic.href}
                    className="inline-flex items-center gap-1 text-sm font-medium text-[#b00715] hover:text-[#91000f]"
                  >
                    {topic.type === "tutorial" ? (
                      <GraduationCap className="h-4 w-4" />
                    ) : topic.type === "guide" ? (
                      <BookOpenCheck className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    Open related module
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

