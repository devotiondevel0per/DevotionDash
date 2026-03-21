import { getOllamaModel } from "@/lib/ai/model-config";

export interface ServiceDeskReplyInput {
  request: {
    id: string;
    title: string;
    description: string;
    priority: string;
    status: string;
    requesterName: string;
    assigneeName: string | null;
    groupName: string | null;
    categoryName: string | null;
  };
  comments: Array<{
    authorName: string;
    content: string;
    createdAt: string;
  }>;
}

export interface ServiceDeskAiReply {
  reply: string;
  followUps: string[];
  tone: "professional" | "empathetic" | "direct";
  confidence: "high" | "medium" | "low";
  generatedAt: string;
  fallback: boolean;
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000);

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

function toTone(value: unknown): ServiceDeskAiReply["tone"] {
  if (value === "professional" || value === "empathetic" || value === "direct") return value;
  return "professional";
}

function toConfidence(value: unknown): ServiceDeskAiReply["confidence"] {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function fallbackReply(input: ServiceDeskReplyInput): ServiceDeskAiReply {
  const nextSteps: string[] = [];
  if (input.request.priority === "high") {
    nextSteps.push("I am marking this as high priority and starting immediate investigation.");
  }
  nextSteps.push("I will update you once we complete the first diagnostic checks.");

  const reply = [
    `Hi ${input.request.requesterName || "there"},`,
    "",
    "Thanks for the detailed report. We have received your request and started reviewing it.",
    nextSteps.join(" "),
    "",
    "If you can share exact timestamps, recent changes, or screenshots, it will help us resolve this faster.",
    "",
    "Regards,",
    input.request.assigneeName ?? "Service Desk Team",
  ].join("\n");

  return {
    reply,
    followUps: [
      "Ask for exact error time and affected users.",
      "Confirm whether issue is reproducible.",
      "Share next update ETA.",
    ],
    tone: "professional",
    confidence: "medium",
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
              "You are an enterprise service desk assistant. Draft concise, professional, human replies. Return JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI request failed (${response.status}): ${text.slice(0, 160)}`);
    }

    const payload = (await response.json()) as { message?: { content?: string } };
    const content = payload.message?.content;
    if (!content || !content.trim()) throw new Error("Empty AI response");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(input: ServiceDeskReplyInput) {
  const compact = {
    request: input.request,
    comments: input.comments.slice(-8),
  };

  return [
    "Draft a customer-ready service desk reply.",
    "Return strict JSON with this shape:",
    '{"reply":"string","followUps":["string"],"tone":"professional|empathetic|direct","confidence":"high|medium|low"}',
    "Rules:",
    "- reply should be 4-10 lines, professional and clear.",
    "- include acknowledgement, current action, and request for missing info if needed.",
    "- no markdown.",
    "- followUps max 4 concise items.",
    `Context: ${JSON.stringify(compact)}`,
  ].join("\n");
}

export async function generateServiceDeskReply(
  input: ServiceDeskReplyInput
): Promise<ServiceDeskAiReply> {
  try {
    const model = await getOllamaModel();
    const raw = await callOllama(buildPrompt(input), model);
    const parsed = parseObject(raw);
    if (!parsed) return fallbackReply(input);

    const reply = safeText(parsed.reply);
    const followUps = Array.isArray(parsed.followUps)
      ? parsed.followUps.map((item) => safeText(item)).filter(Boolean).slice(0, 4)
      : [];

    if (!reply) return fallbackReply(input);

    return {
      reply,
      followUps,
      tone: toTone(parsed.tone),
      confidence: toConfidence(parsed.confidence),
      generatedAt: new Date().toISOString(),
      fallback: false,
    };
  } catch {
    return fallbackReply(input);
  }
}


