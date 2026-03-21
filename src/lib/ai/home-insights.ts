import type { HomeAiAction, HomeAiInsightData, HomeAiRisk, HomeDashboardData, HomeInsightSeverity } from "@/types/home";
import { getOllamaModel } from "@/lib/ai/model-config";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeSeverity(value: unknown): HomeInsightSeverity {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stripFence(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stripFence(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickArrayOfStrings(value: unknown, limit = 5): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => safeString(item))
    .filter(Boolean)
    .slice(0, limit);
}

function buildFallback(data: HomeDashboardData, source: string, reason: string): HomeAiInsightData {
  const totalTaskScope =
    data.breakdown.tasks.opened + data.breakdown.tasks.completed + data.breakdown.tasks.closed;
  const completionRate =
    totalTaskScope === 0 ? 100 : Math.round((data.breakdown.tasks.completed / totalTaskScope) * 100);
  const focusPenalty =
    data.breakdown.tasks.overdue * 9 +
    data.breakdown.requests.highPriorityActive * 8 +
    data.breakdown.emails.unreadOlderThan3Days * 6;
  const focusScore = clamp(100 - focusPenalty, 25, 95);

  const highlights: string[] = [];
  if (completionRate >= 50) highlights.push(`Task completion trend is solid at ${completionRate}%.`);
  if (data.breakdown.events.thisWeek > 0) highlights.push(`${data.breakdown.events.thisWeek} events are planned this week.`);
  if (data.breakdown.requests.open + data.breakdown.requests.pending === 0) {
    highlights.push("Service desk queue is clear right now.");
  }
  if (highlights.length === 0) {
    highlights.push("No major blockers detected from current dashboard signals.");
  }

  const risks: HomeAiRisk[] = [];
  if (data.breakdown.tasks.overdue > 0) {
    risks.push({
      title: `${data.breakdown.tasks.overdue} overdue task(s)`,
      reason: "Overdue work increases spillover risk for the next planning window.",
      severity: data.breakdown.tasks.overdue > 3 ? "high" : "medium",
      href: "/tasks",
    });
  }
  if (data.breakdown.requests.highPriorityActive > 0) {
    risks.push({
      title: `${data.breakdown.requests.highPriorityActive} high-priority request(s)`,
      reason: "High-priority service desk items should be triaged early to keep SLA performance stable.",
      severity: data.breakdown.requests.highPriorityActive > 2 ? "high" : "medium",
      href: "/servicedesk",
    });
  }
  if (data.breakdown.emails.unreadOlderThan3Days > 0) {
    risks.push({
      title: `${data.breakdown.emails.unreadOlderThan3Days} stale unread email(s)`,
      reason: "Older unread messages usually hide pending approvals or blocked communication loops.",
      severity: "low",
      href: "/email",
    });
  }

  const actions: HomeAiAction[] = [
    {
      title: "Clear overdue tasks first",
      description: "Close or reschedule overdue items before starting new tasks.",
      href: "/tasks",
    },
    {
      title: "Run service desk priority sweep",
      description: "Review open and pending requests and reassign urgent tickets.",
      href: "/servicedesk",
    },
    {
      title: "Process unread inbox backlog",
      description: "Reply to old unread conversations that can block next steps.",
      href: "/email",
    },
  ];

  return {
    summary:
      `Fallback insight (${reason}): focus on overdue tasks, high-priority tickets, and aging unread emails to stabilize today's workload.`,
    focusScore,
    highlights: highlights.slice(0, 4),
    risks: risks.slice(0, 3),
    actions: actions.slice(0, 4),
    source,
    generatedAt: new Date().toISOString(),
    fallback: true,
  };
}

async function callOllama(prompt: string, model: string): Promise<string> {
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
        options: {
          temperature: 0.3,
        },
        messages: [
          {
            role: "system",
            content:
              "You are an operations assistant for a business dashboard. Return only valid JSON, no markdown.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${errText.slice(0, 180)}`);
    }

    const payload = (await response.json()) as {
      message?: { content?: string };
      error?: string;
    };

    const content = payload.message?.content;
    if (!content || !content.trim()) {
      throw new Error(payload.error || "Empty content from Ollama");
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function toPrompt(data: HomeDashboardData) {
  const compact = {
    kpis: {
      activeTasks: data.activeTasks,
      openRequests: data.openRequests,
      unreadEmails: data.unreadEmails,
      todayEvents: data.todayEvents,
    },
    breakdown: data.breakdown,
    dueSoonTasks: data.dueSoonTasks.slice(0, 4),
    recentRequests: data.recentRequests.slice(0, 4),
  };

  return [
    "Analyze this work dashboard snapshot and provide practical guidance.",
    "Return strict JSON with this shape:",
    '{"summary":"string","focusScore":0-100,"highlights":["string"],"risks":[{"title":"string","reason":"string","severity":"high|medium|low","href":"string"}],"actions":[{"title":"string","description":"string","href":"string"}]}',
    "Constraints:",
    "- Keep summary to max 2 concise sentences.",
    "- focusScore should be lower when overdue tasks/high-priority requests/stale unread emails are high.",
    "- highlights max 4, risks max 3, actions max 4.",
    '- href values must be one of "/tasks","/servicedesk","/email","/calendar","/clients".',
    `Dashboard JSON: ${JSON.stringify(compact)}`,
  ].join("\n");
}

export async function generateHomeInsights(data: HomeDashboardData): Promise<HomeAiInsightData> {
  const model = await getOllamaModel();
  const source = `ollama:${model}`;

  try {
    const prompt = toPrompt(data);
    const raw = await callOllama(prompt, model);
    const parsed = parseJsonObject(raw);
    if (!parsed) {
      return buildFallback(data, source, "invalid-model-json");
    }

    const summary = safeString(parsed.summary, "AI summary is currently unavailable.");
    const focusScoreRaw = typeof parsed.focusScore === "number" ? parsed.focusScore : Number(parsed.focusScore);
    const focusScore = Number.isFinite(focusScoreRaw) ? clamp(Math.round(focusScoreRaw), 0, 100) : 70;
    const highlights = pickArrayOfStrings(parsed.highlights, 4);

    const risks: HomeAiRisk[] = Array.isArray(parsed.risks)
      ? parsed.risks
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const rec = item as Record<string, unknown>;
            const title = safeString(rec.title);
            if (!title) return null;
            const reason = safeString(rec.reason, "Operational risk identified.");
            const href = safeString(rec.href, "/tasks");
            const safeHref =
              href === "/tasks" || href === "/servicedesk" || href === "/email" || href === "/calendar" || href === "/clients"
                ? href
                : "/tasks";
            return {
              title,
              reason,
              severity: sanitizeSeverity(rec.severity),
              href: safeHref,
            } satisfies HomeAiRisk;
          })
          .filter((item): item is HomeAiRisk => item !== null)
          .slice(0, 3)
      : [];

    const actions: HomeAiAction[] = Array.isArray(parsed.actions)
      ? parsed.actions
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const rec = item as Record<string, unknown>;
            const title = safeString(rec.title);
            const description = safeString(rec.description);
            if (!title || !description) return null;
            const href = safeString(rec.href, "/tasks");
            const safeHref =
              href === "/tasks" || href === "/servicedesk" || href === "/email" || href === "/calendar" || href === "/clients"
                ? href
                : "/tasks";
            return { title, description, href: safeHref } satisfies HomeAiAction;
          })
          .filter((item): item is HomeAiAction => item !== null)
          .slice(0, 4)
      : [];

    if (!summary || (highlights.length === 0 && risks.length === 0 && actions.length === 0)) {
      return buildFallback(data, source, "low-signal-model-output");
    }

    return {
      summary,
      focusScore,
      highlights,
      risks,
      actions,
      source,
      generatedAt: new Date().toISOString(),
      fallback: false,
    };
  } catch {
    return buildFallback(data, source, "model-unavailable");
  }
}





