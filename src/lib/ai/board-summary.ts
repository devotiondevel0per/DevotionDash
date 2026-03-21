import { getOllamaModel } from "@/lib/ai/model-config";

export interface BoardSummaryInput {
  topic: {
    id: string;
    title: string;
    description: string | null;
    categoryName: string | null;
    visibility: string;
    isResolved: boolean;
    createdAt: string;
  };
  posts: Array<{
    id: string;
    authorName: string;
    content: string;
    createdAt: string;
  }>;
}

export interface BoardAiSummary {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
  unansweredQuestions: string[];
  participants: string[];
  tone: "positive" | "neutral" | "negative" | "mixed";
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
  return value.map((item) => safeText(item)).filter(Boolean).slice(0, limit);
}

function normalizeTone(value: unknown): BoardAiSummary["tone"] {
  if (
    value === "positive" ||
    value === "neutral" ||
    value === "negative" ||
    value === "mixed"
  ) {
    return value;
  }
  return "neutral";
}

function collectFallbackPoints(input: BoardSummaryInput): string[] {
  const points: string[] = [];

  if (input.topic.description?.trim()) {
    points.push(input.topic.description.trim());
  }

  for (const post of input.posts.slice(-8)) {
    const sentence = post.content
      .replace(/\s+/g, " ")
      .trim()
      .split(/[.!?]/)
      .map((part) => part.trim())
      .find((part) => part.length >= 18);
    if (sentence) points.push(sentence);
    if (points.length >= 5) break;
  }

  return points.slice(0, 4);
}

function buildFallback(input: BoardSummaryInput): BoardAiSummary {
  const participants = Array.from(
    new Set(input.posts.map((post) => post.authorName).filter(Boolean))
  ).slice(0, 8);

  const totalMessages = input.posts.length;
  const summary =
    totalMessages === 0
      ? `Topic "${input.topic.title}" has no replies yet.`
      : `Topic "${input.topic.title}" has ${totalMessages} replies across ${participants.length} participant${
          participants.length === 1 ? "" : "s"
        }.`;

  const keyPoints = collectFallbackPoints(input);
  const openQuestions = input.posts
    .flatMap((post) =>
      post.content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.endsWith("?") && line.length > 10)
    )
    .slice(0, 3);

  const actionItems = input.posts
    .map((post) => post.content.trim())
    .filter((line) => /\b(todo|action|next|follow up|deadline|owner)\b/i.test(line))
    .slice(0, 3);

  return {
    summary,
    keyPoints: keyPoints.length ? keyPoints : ["Review the full thread for detailed context."],
    decisions: [],
    actionItems,
    unansweredQuestions: openQuestions,
    participants,
    tone: "neutral",
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
        options: { temperature: 0.2 },
        messages: [
          {
            role: "system",
            content:
              "You summarize workplace discussion threads. Return valid JSON only.",
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

function toPrompt(input: BoardSummaryInput) {
  const compact = {
    topic: input.topic,
    posts: input.posts.slice(-30),
  };

  return [
    "Analyze this board topic conversation and return strict JSON.",
    "Schema:",
    '{"summary":"string","keyPoints":["string"],"decisions":["string"],"actionItems":["string"],"unansweredQuestions":["string"],"participants":["string"],"tone":"positive|neutral|negative|mixed"}',
    "Rules:",
    "- summary max 2 short sentences",
    "- keyPoints max 5",
    "- decisions max 4",
    "- actionItems max 5 and phrase as clear follow-ups",
    "- unansweredQuestions max 4",
    "- participants should be unique display names",
    `Data: ${JSON.stringify(compact)}`,
  ].join("\n");
}

export async function generateBoardSummary(
  input: BoardSummaryInput
): Promise<BoardAiSummary> {
  if (input.posts.length === 0) return buildFallback(input);

  try {
    const model = await getOllamaModel();
    const raw = await callOllama(toPrompt(input), model);
    const parsed = parseObject(raw);
    if (!parsed) return buildFallback(input);

    const summary = safeText(parsed.summary, "");
    const keyPoints = pickStrings(parsed.keyPoints, 5);
    const decisions = pickStrings(parsed.decisions, 4);
    const actionItems = pickStrings(parsed.actionItems, 5);
    const unansweredQuestions = pickStrings(parsed.unansweredQuestions, 4);
    const participants = pickStrings(parsed.participants, 8);
    const tone = normalizeTone(parsed.tone);

    if (!summary) return buildFallback(input);

    return {
      summary,
      keyPoints,
      decisions,
      actionItems,
      unansweredQuestions,
      participants,
      tone,
      generatedAt: new Date().toISOString(),
      fallback: false,
    };
  } catch {
    return buildFallback(input);
  }
}



