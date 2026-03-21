import { getOllamaModel } from "@/lib/ai/model-config";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000);

type Sentiment = "positive" | "neutral" | "negative" | "mixed";

export interface LiveChatInsightInput {
  dialog: {
    id: string;
    subject: string;
    visitorName: string | null;
    visitorEmail: string | null;
    status: string;
    assignedTo: string[];
  };
  totals: {
    messages: number;
    attachments: number;
  };
  transcript: Array<{
    role: "visitor" | "agent" | "system";
    author: string;
    text: string;
    createdAt: string;
  }>;
}

export interface LiveChatAiInsight {
  summary: string;
  sentiment: Sentiment;
  intent: string;
  urgencyScore: number;
  highlights: string[];
  recommendations: string[];
  generatedAt: string;
  fallback: boolean;
}

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

function parseSentiment(value: unknown): Sentiment {
  if (value === "positive" || value === "neutral" || value === "negative" || value === "mixed") {
    return value;
  }
  return "neutral";
}

function inferUrgency(input: LiveChatInsightInput) {
  const fullText = input.transcript.map((entry) => entry.text.toLowerCase()).join(" ");
  let score = 35;
  const urgentTerms = ["urgent", "asap", "immediately", "critical", "down", "blocked", "cannot", "can't"];
  for (const term of urgentTerms) {
    if (fullText.includes(term)) score += 8;
  }
  if (input.dialog.status === "open") score += 6;
  if (input.totals.messages > 12) score += 10;
  if (input.totals.attachments > 0) score += 4;
  return clamp(score, 10, 100);
}

function fallbackInsight(input: LiveChatInsightInput): LiveChatAiInsight {
  const urgencyScore = inferUrgency(input);
  const summary =
    input.transcript.length > 0
      ? `Visitor conversation focuses on "${input.dialog.subject}". ${input.transcript[input.transcript.length - 1]?.text?.slice(0, 120) ?? ""}`.trim()
      : `New livechat session "${input.dialog.subject}" is waiting for handling.`;

  const highlights: string[] = [];
  highlights.push(`${input.totals.messages} message(s) exchanged.`);
  if (input.dialog.assignedTo.length > 0) {
    highlights.push(`Assigned to ${input.dialog.assignedTo.join(", ")}.`);
  } else {
    highlights.push("Conversation is currently unassigned.");
  }
  if (input.dialog.visitorEmail) {
    highlights.push(`Visitor email captured: ${input.dialog.visitorEmail}.`);
  }

  const recommendations: string[] = [];
  if (urgencyScore >= 70) {
    recommendations.push("Prioritize immediate response and provide a clear ETA.");
  } else {
    recommendations.push("Send a concise follow-up confirming next action.");
  }
  recommendations.push("Capture qualification details for lead conversion.");
  recommendations.push("Close the chat only after confirming resolution.");

  return {
    summary,
    sentiment: urgencyScore >= 72 ? "negative" : "neutral",
    intent: "Support / inquiry",
    urgencyScore,
    highlights: highlights.slice(0, 4),
    recommendations: recommendations.slice(0, 4),
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
        options: { temperature: 0.2 },
        messages: [
          {
            role: "system",
            content:
              "You analyze customer support livechat conversations and return concise JSON only.",
          },
          { role: "user", content: prompt },
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

function promptFromInput(input: LiveChatInsightInput) {
  const compactTranscript = input.transcript.slice(-25);
  return [
    "Analyze this livechat conversation and produce operational insights.",
    "Return JSON only with this exact structure:",
    '{"summary":"string","sentiment":"positive|neutral|negative|mixed","intent":"string","urgencyScore":0-100,"highlights":["string"],"recommendations":["string"]}',
    "Constraints:",
    "- Keep summary to max 2 short sentences.",
    "- urgencyScore should be higher for unresolved technical/payment/access blocking issues.",
    "- highlights max 4 and recommendations max 4.",
    `Input: ${JSON.stringify({
      dialog: input.dialog,
      totals: input.totals,
      transcript: compactTranscript,
    })}`,
  ].join("\n");
}

export async function generateLiveChatInsights(
  input: LiveChatInsightInput
): Promise<LiveChatAiInsight> {
  try {
    const model = await getOllamaModel();
    const raw = await callOllama(promptFromInput(input), model);
    const parsed = parseObject(raw);
    if (!parsed) return fallbackInsight(input);

    const summary = safeText(parsed.summary);
    const intent = safeText(parsed.intent, "Support / inquiry");
    const urgencyRaw =
      typeof parsed.urgencyScore === "number"
        ? parsed.urgencyScore
        : Number(parsed.urgencyScore);
    const urgencyScore = Number.isFinite(urgencyRaw)
      ? clamp(Math.round(urgencyRaw), 0, 100)
      : inferUrgency(input);

    const highlights = Array.isArray(parsed.highlights)
      ? parsed.highlights.map((entry) => safeText(entry)).filter(Boolean).slice(0, 4)
      : [];
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((entry) => safeText(entry)).filter(Boolean).slice(0, 4)
      : [];

    if (!summary) {
      return fallbackInsight(input);
    }

    return {
      summary,
      sentiment: parseSentiment(parsed.sentiment),
      intent,
      urgencyScore,
      highlights: highlights.length > 0 ? highlights : fallbackInsight(input).highlights,
      recommendations:
        recommendations.length > 0 ? recommendations : fallbackInsight(input).recommendations,
      generatedAt: new Date().toISOString(),
      fallback: false,
    };
  } catch {
    return fallbackInsight(input);
  }
}
