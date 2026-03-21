import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { getOllamaModel } from "@/lib/ai/model-config";

type ModuleReportRow = {
  moduleId: string;
  label: string;
  total: number;
  recent: number;
  backlog: number;
  trend: "up" | "flat" | "down";
};

type EmployeeReportRow = {
  userId: string;
  name: string;
  email: string;
  department: string;
  roles: string[];
  isActive: boolean;
  lastActivity: string | null;
  tasksAssigned: number;
  tasksCompleted: number;
  tasksOverdue: number;
  ticketsAssigned: number;
  ticketsClosed: number;
  emailsSent: number;
  activityScore: number;
};

type ReportInsight = {
  summary: string;
  highlights: string[];
  risks: string[];
  actions: string[];
  source: string;
  fallback: boolean;
};

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toTrend(recent: number, baseline: number): "up" | "flat" | "down" {
  if (recent > baseline * 1.15) return "up";
  if (recent < baseline * 0.85) return "down";
  return "flat";
}

function safeStringList(value: unknown, limit = 4): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function callOllama(prompt: string, model: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: { temperature: 0.2 },
        messages: [
          {
            role: "system",
            content: "You are an enterprise admin analytics assistant. Return JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama failed (${response.status})`);
    }

    const payload = (await response.json()) as { message?: { content?: string } };
    const content = payload.message?.content?.trim();
    if (!content) throw new Error("Empty AI response");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackReportInsight(input: {
  modules: ModuleReportRow[];
  employees: EmployeeReportRow[];
  days: number;
  model: string;
}): ReportInsight {
  const topModule = [...input.modules].sort((a, b) => b.recent - a.recent)[0];
  const backlogModules = input.modules.filter((module) => module.backlog > 0).slice(0, 3);
  const topEmployees = [...input.employees]
    .sort((a, b) => b.activityScore - a.activityScore)
    .slice(0, 3)
    .map((item) => item.name);

  const highlights = [
    topModule
      ? `${topModule.label} has the highest activity in the last ${input.days} days (${topModule.recent}).`
      : "No module activity found in this window.",
    topEmployees.length > 0
      ? `Top contributors: ${topEmployees.join(", ")}.`
      : "No employee activity detected yet.",
    `${input.modules.filter((module) => module.trend === "up").length} module(s) are trending up.`,
  ];

  const risks = backlogModules.length
    ? backlogModules.map(
        (module) => `${module.label} has backlog pressure (${module.backlog}) and should be reviewed.`
      )
    : ["No major backlog signals detected in the selected period."];

  return {
    summary: "Operational activity is stable. Focus on module backlogs and keep contribution balanced across the team.",
    highlights,
    risks,
    actions: [
      "Review backlog-heavy modules and assign resolution owners.",
      "Rebalance workload from top contributors to secondary team members.",
      "Run this report weekly and compare trend movement.",
    ],
    source: `fallback:${input.model}`,
    fallback: true,
  };
}

function buildReportPrompt(input: {
  modules: ModuleReportRow[];
  employees: EmployeeReportRow[];
  days: number;
}) {
  const compact = {
    days: input.days,
    modules: input.modules,
    employees: input.employees.slice(0, 8).map((employee) => ({
      name: employee.name,
      department: employee.department,
      activityScore: employee.activityScore,
      tasksCompleted: employee.tasksCompleted,
      ticketsClosed: employee.ticketsClosed,
      emailsSent: employee.emailsSent,
      tasksOverdue: employee.tasksOverdue,
    })),
  };

  return [
    "Analyze this administration report snapshot.",
    "Return strict JSON with shape:",
    '{"summary":"string","highlights":["string"],"risks":["string"],"actions":["string"]}',
    "Rules:",
    "- summary max 2 short sentences",
    "- highlights/risks/actions max 4 each",
    "- emphasize practical governance and operations actions",
    `Data: ${JSON.stringify(compact)}`,
  ].join("\n");
}

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const parsedDays = Number.parseInt(searchParams.get("days") ?? "30", 10);
    const days = Number.isFinite(parsedDays) ? clamp(parsedDays, 7, 180) : 30;
    const includeInsight = searchParams.get("insight") === "1";

    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);
    const upcomingWindow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      tasksTotal,
      tasksRecent,
      tasksPrevious,
      tasksOpen,
      tasksOverdue,
      projectsTotal,
      projectsRecent,
      projectsPrevious,
      documentsTotal,
      documentsRecent,
      documentsPrevious,
      emailsTotal,
      emailsRecent,
      emailsPrevious,
      emailsUnread,
      emailsSent,
      organizationsTotal,
      organizationsRecent,
      organizationsPrevious,
      contactsTotal,
      contactsRecent,
      contactsPrevious,
      boardTotal,
      boardRecent,
      boardPrevious,
      boardOpen,
      calendarUpcoming,
      chatRecent,
      chatPrevious,
      serviceTotal,
      serviceRecent,
      servicePrevious,
      serviceOpen,
      usersTotal,
      usersActive,
      auditRecent,
      settings,
      users,
      taskAssignees,
      serviceRequests,
      sentEmailsByUser,
      auditByUser,
    ] = await Promise.all([
      prisma.task.count(),
      prisma.task.count({ where: { createdAt: { gte: since } } }),
      prisma.task.count({ where: { createdAt: { gte: previousSince, lt: since } } }),
      prisma.task.count({ where: { status: { in: ["opened"] } } }),
      prisma.task.count({ where: { status: "opened", dueDate: { lt: now } } }),

      prisma.project.count(),
      prisma.project.count({ where: { createdAt: { gte: since } } }),
      prisma.project.count({ where: { createdAt: { gte: previousSince, lt: since } } }),

      prisma.document.count(),
      prisma.document.count({ where: { createdAt: { gte: since } } }),
      prisma.document.count({ where: { createdAt: { gte: previousSince, lt: since } } }),

      prisma.email.count(),
      prisma.email.count({ where: { createdAt: { gte: since } } }),
      prisma.email.count({ where: { createdAt: { gte: previousSince, lt: since } } }),
      prisma.email.count({ where: { isRead: false, status: "inbox" } }),
      prisma.email.count({ where: { status: "sent" } }),

      prisma.organization.count(),
      prisma.organization.count({ where: { createdAt: { gte: since } } }),
      prisma.organization.count({ where: { createdAt: { gte: previousSince, lt: since } } }),

      prisma.contact.count(),
      prisma.contact.count({ where: { createdAt: { gte: since } } }),
      prisma.contact.count({ where: { createdAt: { gte: previousSince, lt: since } } }),

      prisma.boardTopic.count(),
      prisma.boardTopic.count({ where: { createdAt: { gte: since } } }),
      prisma.boardTopic.count({ where: { createdAt: { gte: previousSince, lt: since } } }),
      prisma.boardTopic.count({ where: { isResolved: false } }),

      prisma.calendarEvent.count({ where: { startDate: { gte: now, lte: upcomingWindow } } }),

      prisma.chatMessage.count({ where: { createdAt: { gte: since } } }),
      prisma.chatMessage.count({ where: { createdAt: { gte: previousSince, lt: since } } }),

      prisma.serviceDeskRequest.count(),
      prisma.serviceDeskRequest.count({ where: { createdAt: { gte: since } } }),
      prisma.serviceDeskRequest.count({ where: { createdAt: { gte: previousSince, lt: since } } }),
      prisma.serviceDeskRequest.count({ where: { status: { in: ["open", "pending"] } } }),

      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),

      prisma.auditLog.count({ where: { createdAt: { gte: since } } }),

      prisma.systemSetting.findMany({
        where: { key: { in: ["system.defaultTimezone", "app.name"] } },
        select: { key: true, value: true },
      }),

      prisma.user.findMany({
        orderBy: { fullname: "asc" },
        select: {
          id: true,
          fullname: true,
          name: true,
          surname: true,
          email: true,
          department: true,
          isActive: true,
          lastActivity: true,
          groupMembers: {
            select: {
              group: {
                select: { name: true },
              },
            },
          },
        },
      }),

      prisma.taskAssignee.findMany({
        where: { task: { createdAt: { gte: since } } },
        select: {
          userId: true,
          task: {
            select: {
              status: true,
              priority: true,
              dueDate: true,
            },
          },
        },
      }),

      prisma.serviceDeskRequest.findMany({
        where: { createdAt: { gte: since } },
        select: {
          assigneeId: true,
          status: true,
        },
      }),

      prisma.email.findMany({
        where: {
          status: "sent",
          createdAt: { gte: since },
          fromId: { not: null },
        },
        select: { fromId: true },
      }),

      prisma.auditLog.findMany({
        where: { createdAt: { gte: since }, userId: { not: null } },
        select: { userId: true },
      }),
    ]);

    const settingsMap = new Map(settings.map((entry) => [entry.key, entry.value]));
    const timezone = settingsMap.get("system.defaultTimezone") || "UTC";

    const modules: ModuleReportRow[] = [
      {
        moduleId: "tasks",
        label: "Tasks",
        total: tasksTotal,
        recent: tasksRecent,
        backlog: tasksOpen + tasksOverdue,
        trend: toTrend(tasksRecent, tasksPrevious || 1),
      },
      {
        moduleId: "projects",
        label: "Projects",
        total: projectsTotal,
        recent: projectsRecent,
        backlog: 0,
        trend: toTrend(projectsRecent, projectsPrevious || 1),
      },
      {
        moduleId: "documents",
        label: "Documents",
        total: documentsTotal,
        recent: documentsRecent,
        backlog: 0,
        trend: toTrend(documentsRecent, documentsPrevious || 1),
      },
      {
        moduleId: "email",
        label: "E-Mail",
        total: emailsTotal,
        recent: emailsRecent,
        backlog: emailsUnread,
        trend: toTrend(emailsRecent, emailsPrevious || 1),
      },
      {
        moduleId: "clients",
        label: "Organizations",
        total: organizationsTotal,
        recent: organizationsRecent,
        backlog: 0,
        trend: toTrend(organizationsRecent, organizationsPrevious || 1),
      },
      {
        moduleId: "contacts",
        label: "Contacts",
        total: contactsTotal,
        recent: contactsRecent,
        backlog: 0,
        trend: toTrend(contactsRecent, contactsPrevious || 1),
      },
      {
        moduleId: "board",
        label: "Board",
        total: boardTotal,
        recent: boardRecent,
        backlog: boardOpen,
        trend: toTrend(boardRecent, boardPrevious || 1),
      },
      {
        moduleId: "calendar",
        label: "Calendar",
        total: calendarUpcoming,
        recent: calendarUpcoming,
        backlog: 0,
        trend: "flat",
      },
      {
        moduleId: "chat",
        label: "Chat",
        total: chatRecent,
        recent: chatRecent,
        backlog: 0,
        trend: toTrend(chatRecent, chatPrevious || 1),
      },
      {
        moduleId: "servicedesk",
        label: "Service Desk",
        total: serviceTotal,
        recent: serviceRecent,
        backlog: serviceOpen,
        trend: toTrend(serviceRecent, servicePrevious || 1),
      },
    ];

    const employeeMap = new Map<string, Omit<EmployeeReportRow, "activityScore"> & { activityRaw: number }>();

    for (const user of users) {
      const fullName = (user.fullname || `${user.name} ${user.surname}`.trim()).trim() || user.email;
      employeeMap.set(user.id, {
        userId: user.id,
        name: fullName,
        email: user.email,
        department: user.department || "-",
        roles: user.groupMembers.map((member) => member.group.name),
        isActive: user.isActive,
        lastActivity: user.lastActivity ? user.lastActivity.toISOString() : null,
        tasksAssigned: 0,
        tasksCompleted: 0,
        tasksOverdue: 0,
        ticketsAssigned: 0,
        ticketsClosed: 0,
        emailsSent: 0,
        activityRaw: 0,
      });
    }

    for (const assignment of taskAssignees) {
      const row = employeeMap.get(assignment.userId);
      if (!row) continue;
      row.tasksAssigned += 1;
      if (assignment.task.status === "completed" || assignment.task.status === "closed") {
        row.tasksCompleted += 1;
      }
      if (
        assignment.task.status === "opened" &&
        assignment.task.dueDate &&
        new Date(assignment.task.dueDate).getTime() < now.getTime()
      ) {
        row.tasksOverdue += 1;
      }
    }

    for (const request of serviceRequests) {
      if (!request.assigneeId) continue;
      const row = employeeMap.get(request.assigneeId);
      if (!row) continue;
      row.ticketsAssigned += 1;
      if (request.status === "closed") row.ticketsClosed += 1;
    }

    for (const email of sentEmailsByUser) {
      if (!email.fromId) continue;
      const row = employeeMap.get(email.fromId);
      if (!row) continue;
      row.emailsSent += 1;
    }

    for (const auditEntry of auditByUser) {
      if (!auditEntry.userId) continue;
      const row = employeeMap.get(auditEntry.userId);
      if (!row) continue;
      row.activityRaw += 1;
    }

    const employees: EmployeeReportRow[] = Array.from(employeeMap.values())
      .map((row) => {
        const activeBoost = row.isActive ? 6 : -15;
        const recencyBoost = row.lastActivity
          ? clamp(Math.round((Date.now() - new Date(row.lastActivity).getTime()) / (1000 * 60 * 60 * 24)), 0, 30)
          : 30;
        const activityScore = clamp(
          20 +
            row.tasksCompleted * 8 +
            row.ticketsClosed * 10 +
            row.emailsSent * 2 +
            row.activityRaw * 1 +
            activeBoost -
            row.tasksOverdue * 7 -
            recencyBoost,
          0,
          100
        );

        return {
          userId: row.userId,
          name: row.name,
          email: row.email,
          department: row.department,
          roles: row.roles,
          isActive: row.isActive,
          lastActivity: row.lastActivity,
          tasksAssigned: row.tasksAssigned,
          tasksCompleted: row.tasksCompleted,
          tasksOverdue: row.tasksOverdue,
          ticketsAssigned: row.ticketsAssigned,
          ticketsClosed: row.ticketsClosed,
          emailsSent: row.emailsSent,
          activityScore,
        };
      })
      .sort((a, b) => b.activityScore - a.activityScore);

    let insight: ReportInsight | null = null;

    if (includeInsight) {
      const model = await getOllamaModel();
      try {
        const raw = await callOllama(
          buildReportPrompt({ modules, employees, days }),
          model
        );
        const parsed = parseJsonObject(raw);
        if (parsed) {
          const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
          if (summary) {
            insight = {
              summary,
              highlights: safeStringList(parsed.highlights, 4),
              risks: safeStringList(parsed.risks, 4),
              actions: safeStringList(parsed.actions, 4),
              source: `ollama:${model}`,
              fallback: false,
            };
          }
        }
      } catch {
        insight = null;
      }

      if (!insight) {
        insight = fallbackReportInsight({ modules, employees, days, model });
      }
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      days,
      timezone,
      totals: {
        users: usersTotal,
        activeUsers: usersActive,
        unreadEmails: emailsUnread,
        openServiceRequests: serviceOpen,
        sentEmails: emailsSent,
        auditEvents: auditRecent,
      },
      modules,
      employees,
      insight,
    });
  } catch (error) {
    console.error("[GET /api/administration/reports]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
