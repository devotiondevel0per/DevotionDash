import { getOllamaModel } from "@/lib/ai/model-config";

export interface OrganizationInsightInput {
  organization: {
    id: string;
    name: string;
    type: string;
    status: string;
    rating: string;
    industry: string | null;
    leadSource: string | null;
    managerName: string | null;
    createdAt: string;
    updatedAt: string;
  };
  metrics: {
    contacts: number;
    emails: number;
    chatDialogs: number;
    serviceDeskRequests: number;
    historyEntries: number;
    openServiceDeskRequests: number;
    closedServiceDeskRequests: number;
    recentEmails30d: number;
  };
  recentTimeline: Array<{
    createdAt: string;
    content: string;
    isSystem: boolean;
    userName: string | null;
  }>;
}

export interface OrganizationAiInsights {
  summary: string;
  healthScore: number;
  highlights: string[];
  risks: string[];
  opportunities: string[];
  actionPlan: string[];
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

function pickStringList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => safeText(item))
    .filter(Boolean)
    .slice(0, limit);
}

function buildFallback(input: OrganizationInsightInput): OrganizationAiInsights {
  const riskPenalty =
    input.metrics.openServiceDeskRequests * 8 +
    Math.max(0, 2 - input.metrics.contacts) * 10 +
    (input.organization.status === "closed" ? 25 : 0);
  const healthScore = clamp(82 - riskPenalty, 25, 96);

  const highlights: string[] = [];
  if (input.metrics.contacts > 0) {
    highlights.push(`${input.metrics.contacts} contact(s) linked to this organization.`);
  }
  if (input.metrics.recentEmails30d > 0) {
    highlights.push(`${input.metrics.recentEmails30d} email conversation(s) in the last 30 days.`);
  }
  if (input.metrics.historyEntries > 0) {
    highlights.push(`${input.metrics.historyEntries} timeline update(s) are recorded.`);
  }
  if (highlights.length === 0) {
    highlights.push("No strong engagement signals found in current data.");
  }

  const risks: string[] = [];
  if (input.metrics.openServiceDeskRequests > 0) {
    risks.push(
      `${input.metrics.openServiceDeskRequests} open service request(s) may affect relationship quality.`
    );
  }
  if (input.metrics.contacts === 0) {
    risks.push("No direct contacts are linked; communication continuity is fragile.");
  }
  if (input.organization.status === "closed") {
    risks.push("Organization is closed; review if reactivation is needed.");
  }

  const opportunities: string[] = [];
  if (input.organization.type === "potential") {
    opportunities.push("Convert this lead with a next-meeting or proposal milestone.");
  }
  if (input.metrics.recentEmails30d === 0) {
    opportunities.push("Re-engage with a proactive follow-up campaign.");
  }
  if (input.metrics.contacts > 0 && input.metrics.openServiceDeskRequests === 0) {
    opportunities.push("Upsell/cross-sell discussion can be initiated from a stable account state.");
  }

  const actionPlan: string[] = [
    "Confirm the account owner and define a weekly follow-up cadence.",
    "Update timeline with clear next step and target date.",
    "Review open requests and assign a relationship-impact priority.",
  ];

  return {
    summary: `Snapshot: ${input.organization.name} is currently ${input.organization.status} with ${input.metrics.contacts} contact(s) and ${input.metrics.openServiceDeskRequests} open request(s).`,
    healthScore,
    highlights: highlights.slice(0, 4),
    risks: risks.slice(0, 4),
    opportunities: opportunities.slice(0, 4),
    actionPlan: actionPlan.slice(0, 5),
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
              "You analyze CRM organization performance and return concise JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI request failed (${response.status}): ${text.slice(0, 120)}`);
    }

    const payload = (await response.json()) as { message?: { content?: string } };
    const content = payload.message?.content;
    if (!content || !content.trim()) {
      throw new Error("AI returned empty content");
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function toPrompt(input: OrganizationInsightInput) {
  const compact = {
    organization: input.organization,
    metrics: input.metrics,
    recentTimeline: input.recentTimeline.slice(0, 10),
  };

  return [
    "Analyze this CRM organization snapshot and provide practical insights.",
    "Return strict JSON with this shape:",
    '{"summary":"string","healthScore":0-100,"highlights":["string"],"risks":["string"],"opportunities":["string"],"actionPlan":["string"]}',
    "Constraints:",
    "- summary max 2 short sentences.",
    "- healthScore should be lower when open requests are high or engagement signals are weak.",
    "- highlights/risks/opportunities max 4 each.",
    "- actionPlan max 5 concise and actionable lines.",
    `Data: ${JSON.stringify(compact)}`,
  ].join("\n");
}

export async function generateOrganizationInsights(
  input: OrganizationInsightInput
): Promise<OrganizationAiInsights> {
  try {
    const model = await getOllamaModel();
    const raw = await callOllama(toPrompt(input), model);
    const parsed = parseObject(raw);
    if (!parsed) return buildFallback(input);

    const summary = safeText(parsed.summary);
    const scoreRaw =
      typeof parsed.healthScore === "number"
        ? parsed.healthScore
        : Number(parsed.healthScore);
    const healthScore = Number.isFinite(scoreRaw)
      ? clamp(Math.round(scoreRaw), 0, 100)
      : 68;
    const highlights = pickStringList(parsed.highlights, 4);
    const risks = pickStringList(parsed.risks, 4);
    const opportunities = pickStringList(parsed.opportunities, 4);
    const actionPlan = pickStringList(parsed.actionPlan, 5);

    if (!summary) return buildFallback(input);

    return {
      summary,
      healthScore,
      highlights,
      risks,
      opportunities,
      actionPlan,
      generatedAt: new Date().toISOString(),
      fallback: false,
    };
  } catch {
    return buildFallback(input);
  }
}


