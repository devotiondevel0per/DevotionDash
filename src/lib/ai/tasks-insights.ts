import { getOllamaModel } from "@/lib/ai/model-config";

type TaskInsightSeverity = "high" | "medium" | "low";

export interface TaskInsightSnapshot {
  totals: {
    opened: number;
    completed: number;
    closed: number;
    overdue: number;
    dueToday: number;
    dueSoon: number;
    highPriorityOpen: number;
  };
  focusTasks: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    dueDate: string | null;
    openHours: number;
  }>;
}

export interface TaskAiInsight {
  summary: string;
  workloadScore: number;
  highlights: string[];
  risks: Array<{
    title: string;
    reason: string;
    severity: TaskInsightSeverity;
    href: string;
  }>;
  recommendations: Array<{
    title: string;
    description: string;
    href: string;
  }>;
  generatedAt: string;
  fallback: boolean;
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stripFence(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stripFence(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function severity(value: unknown): TaskInsightSeverity {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function fallbackInsight(snapshot: TaskInsightSnapshot): TaskAiInsight {
  const score = clamp(
    100 -
      snapshot.totals.overdue * 12 -
      snapshot.totals.highPriorityOpen * 9 -
      snapshot.totals.dueToday * 6,
    20,
    95
  );

  const highlights: string[] = [];
  if (snapshot.totals.completed > 0) {
    highlights.push(`${snapshot.totals.completed} tasks completed recently.`);
  }
  if (snapshot.totals.dueSoon > 0) {
    highlights.push(`${snapshot.totals.dueSoon} tasks are due soon.`);
  }
  if (highlights.length === 0) {
    highlights.push("Task load looks stable based on current data.");
  }

  const risks: TaskAiInsight["risks"] = [];
  if (snapshot.totals.overdue > 0) {
    risks.push({
      title: `${snapshot.totals.overdue} overdue task(s)`,
      reason: "Overdue tasks can cause schedule slippage if not triaged early.",
      severity: snapshot.totals.overdue > 2 ? "high" : "medium",
      href: "/tasks",
    });
  }
  if (snapshot.totals.highPriorityOpen > 0) {
    risks.push({
      title: `${snapshot.totals.highPriorityOpen} high-priority open task(s)`,
      reason: "High-priority items should be time-boxed and assigned first.",
      severity: snapshot.totals.highPriorityOpen > 2 ? "high" : "medium",
      href: "/tasks",
    });
  }
  if (snapshot.totals.dueToday > 0) {
    risks.push({
      title: `${snapshot.totals.dueToday} task(s) due today`,
      reason: "Same-day deadlines can quickly become overdue without focused execution.",
      severity: "low",
      href: "/tasks",
    });
  }

  return {
    summary:
      "Current task analysis suggests focusing on overdue and high-priority open work first, then clearing due-soon items to reduce deadline pressure.",
    workloadScore: score,
    highlights: highlights.slice(0, 4),
    risks: risks.slice(0, 3),
    recommendations: [
      {
        title: "Prioritize overdue work",
        description: "Close or reschedule overdue tasks before taking new assignments.",
        href: "/tasks",
      },
      {
        title: "Resolve high-priority queue",
        description: "Assign owners and set concrete deadlines for high-priority tasks.",
        href: "/tasks",
      },
      {
        title: "Review due-soon deadlines",
        description: "Break near-term tasks into smaller checkpoints to avoid misses.",
        href: "/tasks",
      },
    ],
    generatedAt: new Date().toISOString(),
    fallback: true,
  };
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
        options: { temperature: 0.25 },
        messages: [
          {
            role: "system",
            content:
              "You analyze task execution data and return concise JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI request failed (${response.status}): ${text.slice(0, 120)}`);
    }

    const payload = (await response.json()) as {
      message?: { content?: string };
      error?: string;
    };

    const content = payload.message?.content;
    if (!content || !content.trim()) {
      throw new Error(payload.error || "Empty AI response");
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function promptFromSnapshot(snapshot: TaskInsightSnapshot) {
  return [
    "Analyze this task snapshot and generate concise operational insights.",
    "Return JSON only with this exact structure:",
    '{"summary":"string","workloadScore":0-100,"highlights":["string"],"risks":[{"title":"string","reason":"string","severity":"high|medium|low","href":"/tasks"}],"recommendations":[{"title":"string","description":"string","href":"/tasks"}]}',
    "Constraints:",
    "- Summary max 2 short sentences.",
    "- Workload score lower when overdue/high-priority/due-today counts are high.",
    "- highlights max 4, risks max 3, recommendations max 4.",
    `Snapshot: ${JSON.stringify(snapshot)}`,
  ].join("\n");
}

export async function generateTaskInsights(snapshot: TaskInsightSnapshot): Promise<TaskAiInsight> {
  try {
    const model = await getOllamaModel();
    const raw = await callOllama(promptFromSnapshot(snapshot), model);
    const parsed = parseObject(raw);
    if (!parsed) return fallbackInsight(snapshot);

    const summary = safeText(parsed.summary, "Task insights are not available right now.");
    const scoreRaw =
      typeof parsed.workloadScore === "number"
        ? parsed.workloadScore
        : Number(parsed.workloadScore);
    const workloadScore = Number.isFinite(scoreRaw)
      ? clamp(Math.round(scoreRaw), 0, 100)
      : 65;

    const highlights = Array.isArray(parsed.highlights)
      ? parsed.highlights.map((x) => safeText(x)).filter(Boolean).slice(0, 4)
      : [];

    const risks: TaskAiInsight["risks"] = Array.isArray(parsed.risks)
      ? parsed.risks
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const obj = entry as Record<string, unknown>;
            const title = safeText(obj.title);
            if (!title) return null;
            return {
              title,
              reason: safeText(obj.reason, "Potential execution risk identified."),
              severity: severity(obj.severity),
              href: "/tasks",
            };
          })
          .filter((x): x is TaskAiInsight["risks"][number] => x !== null)
          .slice(0, 3)
      : [];

    const recommendations: TaskAiInsight["recommendations"] = Array.isArray(
      parsed.recommendations
    )
      ? parsed.recommendations
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const obj = entry as Record<string, unknown>;
            const title = safeText(obj.title);
            const description = safeText(obj.description);
            if (!title || !description) return null;
            return {
              title,
              description,
              href: "/tasks",
            };
          })
          .filter((x): x is TaskAiInsight["recommendations"][number] => x !== null)
          .slice(0, 4)
      : [];

    if (!summary || (highlights.length === 0 && risks.length === 0)) {
      return fallbackInsight(snapshot);
    }

    return {
      summary,
      workloadScore,
      highlights,
      risks,
      recommendations:
        recommendations.length > 0
          ? recommendations
          : fallbackInsight(snapshot).recommendations,
      generatedAt: new Date().toISOString(),
      fallback: false,
    };
  } catch {
    return fallbackInsight(snapshot);
  }
}


