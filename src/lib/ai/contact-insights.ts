import { getOllamaModel } from "@/lib/ai/model-config";

export interface ContactInsightInput {
  contact: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    position: string | null;
    department: string | null;
    city: string | null;
    country: string | null;
    createdAt: string;
    updatedAt: string;
    ownerName: string | null;
  };
  organization: {
    id: string;
    name: string;
    type: string;
    status: string;
    rating: string;
    industry: string | null;
    managerName: string | null;
    contactsCount: number;
  } | null;
  metrics: {
    emailsFromContactTotal: number;
    emailsFromContact30d: number;
    openServiceDeskRequests: number;
    closedServiceDeskRequests: number;
    orgTimelineEntries30d: number;
    profileCompleteness: number;
  };
}

export interface ContactAiInsights {
  summary: string;
  relationshipScore: number;
  highlights: string[];
  risks: string[];
  opportunities: string[];
  nextActions: string[];
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

function buildFallback(input: ContactInsightInput): ContactAiInsights {
  const hasPhone = Boolean(input.contact.mobile || input.contact.phone);
  const hasEmail = Boolean(input.contact.email);
  const inActiveOrganization = Boolean(
    input.organization && input.organization.status === "open"
  );

  const riskPenalty =
    (100 - input.metrics.profileCompleteness) * 0.28 +
    input.metrics.openServiceDeskRequests * 6 +
    (!hasEmail ? 10 : 0) +
    (!hasPhone ? 8 : 0) +
    (!inActiveOrganization ? 5 : 0);

  const relationshipScore = clamp(Math.round(86 - riskPenalty), 22, 97);

  const highlights: string[] = [];
  if (input.metrics.profileCompleteness >= 75) {
    highlights.push(
      `Contact profile is ${input.metrics.profileCompleteness}% complete.`
    );
  }
  if (input.metrics.emailsFromContact30d > 0) {
    highlights.push(
      `${input.metrics.emailsFromContact30d} inbound email(s) were received in the last 30 days.`
    );
  }
  if (input.organization) {
    highlights.push(
      `Linked to ${input.organization.name} (${input.organization.contactsCount} contact(s) in account).`
    );
  }
  if (highlights.length === 0) {
    highlights.push("Limited engagement signals are currently available.");
  }

  const risks: string[] = [];
  if (!hasEmail) risks.push("No email on file, reducing outbound communication options.");
  if (!hasPhone) risks.push("No phone/mobile available for quick follow-up.");
  if (input.metrics.openServiceDeskRequests > 0) {
    risks.push(
      `${input.metrics.openServiceDeskRequests} open service request(s) could impact relationship quality.`
    );
  }
  if (!input.organization) {
    risks.push("Contact is not linked to an organization, making account context weaker.");
  }

  const opportunities: string[] = [];
  if (input.metrics.profileCompleteness < 90) {
    opportunities.push("Complete missing profile fields for better routing and segmentation.");
  }
  if (input.metrics.emailsFromContact30d === 0 && hasEmail) {
    opportunities.push("Re-engage with a short check-in email to reopen conversation.");
  }
  if (input.organization?.status === "open") {
    opportunities.push("Coordinate with account owner to map next milestone for this contact.");
  }
  if (opportunities.length === 0) {
    opportunities.push("Maintain current cadence and track response quality.");
  }

  const nextActions = [
    "Confirm preferred communication channel and response window.",
    "Add one contextual note about current priority or project.",
    "Schedule the next follow-up date and assign owner accountability.",
  ];

  return {
    summary: `${input.contact.fullName} has a relationship score of ${relationshipScore} with ${input.metrics.emailsFromContact30d} recent inbound email signal(s).`,
    relationshipScore,
    highlights: highlights.slice(0, 4),
    risks: risks.slice(0, 4),
    opportunities: opportunities.slice(0, 4),
    nextActions: nextActions.slice(0, 5),
    generatedAt: new Date().toISOString(),
    fallback: true,
  };
}

function toPrompt(input: ContactInsightInput) {
  const compact = {
    contact: input.contact,
    organization: input.organization,
    metrics: input.metrics,
  };

  return [
    "Analyze this CRM contact snapshot and provide concise practical insights.",
    "Return strict JSON with this shape:",
    '{"summary":"string","relationshipScore":0-100,"highlights":["string"],"risks":["string"],"opportunities":["string"],"nextActions":["string"]}',
    "Constraints:",
    "- summary max 2 short sentences.",
    "- relationshipScore should decrease for weak profile completeness and high open requests.",
    "- highlights/risks/opportunities max 4 each.",
    "- nextActions max 5 concise lines.",
    `Data: ${JSON.stringify(compact)}`,
  ].join("\n");
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
            content: "You analyze CRM contact performance and return concise JSON only.",
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

export async function generateContactInsights(
  input: ContactInsightInput
): Promise<ContactAiInsights> {
  try {
    const model = await getOllamaModel();
    const raw = await callOllama(toPrompt(input), model);
    const parsed = parseObject(raw);
    if (!parsed) return buildFallback(input);

    const summary = safeText(parsed.summary);
    const scoreRaw =
      typeof parsed.relationshipScore === "number"
        ? parsed.relationshipScore
        : Number(parsed.relationshipScore);
    const relationshipScore = Number.isFinite(scoreRaw)
      ? clamp(Math.round(scoreRaw), 0, 100)
      : 65;
    const highlights = pickStringList(parsed.highlights, 4);
    const risks = pickStringList(parsed.risks, 4);
    const opportunities = pickStringList(parsed.opportunities, 4);
    const nextActions = pickStringList(parsed.nextActions, 5);

    if (!summary) return buildFallback(input);

    return {
      summary,
      relationshipScore,
      highlights,
      risks,
      opportunities,
      nextActions,
      generatedAt: new Date().toISOString(),
      fallback: false,
    };
  } catch {
    return buildFallback(input);
  }
}


