import { getOllamaModel } from "@/lib/ai/model-config";

export interface TaskConversationSummaryInput {
  task: {
    id: string;
    title: string;
    type: string;
    status: string;
    priority: string;
    description: string | null;
    createdAt: string;
    dueDate: string | null;
  };
  comments: Array<{
    id: string;
    authorName: string;
    parentCommentId: string | null;
    content: string;
    createdAt: string;
    attachmentCount: number;
  }>;
}

export interface TaskConversationSummary {
  summary: string;
  highlights: string[];
  decisions: string[];
  actionItems: string[];
  risks: string[];
  participants: string[];
  generatedAt: string;
  fallback: boolean;
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000);

function safeText(value: unknown, fallback = ""): string {
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

function pickStrings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => safeText(entry)).filter(Boolean).slice(0, limit);
}

function stripHtml(value: string | null) {
  if (!value) return "";
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFallback(input: TaskConversationSummaryInput): TaskConversationSummary {
  const participants = Array.from(
    new Set(input.comments.map((comment) => comment.authorName).filter(Boolean))
  ).slice(0, 12);
  const totalComments = input.comments.length;
  const summary =
    totalComments === 0
      ? `Task "${input.task.title}" has no conversation yet.`
      : `Task "${input.task.title}" has ${totalComments} comments across ${participants.length} participant${
          participants.length === 1 ? "" : "s"
        }.`;

  const highlights = input.comments
    .slice(-6)
    .map((comment) => stripHtml(comment.content))
    .filter((text) => text.length >= 16)
    .slice(0, 4);
  const actionItems = input.comments
    .map((comment) => stripHtml(comment.content))
    .filter((text) => /\b(todo|action|next|follow up|deadline|owner|assign)\b/i.test(text))
    .slice(0, 4);
  const risks = input.comments
    .map((comment) => stripHtml(comment.content))
    .filter((text) => /\bblocked|delay|risk|issue|problem|dependency\b/i.test(text))
    .slice(0, 3);

  return {
    summary,
    highlights: highlights.length > 0 ? highlights : ["No notable highlights extracted yet."],
    decisions: [],
    actionItems,
    risks,
    participants,
    generatedAt: new Date().toISOString(),
    fallback: true,
  };
}

function toPrompt(input: TaskConversationSummaryInput) {
  const compact = {
    task: {
      ...input.task,
      description: stripHtml(input.task.description),
    },
    comments: input.comments.slice(-60).map((comment) => ({
      ...comment,
      content: stripHtml(comment.content),
    })),
  };

  return [
    "Analyze this task conversation thread and return strict JSON.",
    "Schema:",
    '{"summary":"string","highlights":["string"],"decisions":["string"],"actionItems":["string"],"risks":["string"],"participants":["string"]}',
    "Rules:",
    "- summary max 2 concise sentences",
    "- highlights max 6",
    "- decisions max 5",
    "- actionItems max 6 and phrased as clear next actions",
    "- risks max 4",
    "- participants should be unique display names",
    `Data: ${JSON.stringify(compact)}`,
  ].join("\n");
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
        options: { temperature: 0.2 },
        messages: [
          {
            role: "system",
            content: "You summarize enterprise task conversations and return valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI request failed (${response.status}): ${text.slice(0, 140)}`);
    }
    const payload = (await response.json()) as { message?: { content?: string } };
    const content = payload.message?.content;
    if (!content || !content.trim()) {
      throw new Error("Empty AI response");
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateTaskConversationSummary(
  input: TaskConversationSummaryInput
): Promise<TaskConversationSummary> {
  if (input.comments.length === 0) {
    return buildFallback(input);
  }

  try {
    const model = await getOllamaModel();
    const raw = await callOllama(toPrompt(input), model);
    const parsed = parseObject(raw);
    if (!parsed) return buildFallback(input);

    const summary = safeText(parsed.summary);
    if (!summary) return buildFallback(input);

    const result: TaskConversationSummary = {
      summary,
      highlights: pickStrings(parsed.highlights, 6),
      decisions: pickStrings(parsed.decisions, 5),
      actionItems: pickStrings(parsed.actionItems, 6),
      risks: pickStrings(parsed.risks, 4),
      participants: pickStrings(parsed.participants, 12),
      generatedAt: new Date().toISOString(),
      fallback: false,
    };

    if (
      result.highlights.length === 0 &&
      result.decisions.length === 0 &&
      result.actionItems.length === 0
    ) {
      return buildFallback(input);
    }

    return result;
  } catch {
    return buildFallback(input);
  }
}
