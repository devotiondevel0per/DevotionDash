import { getOllamaModel } from "@/lib/ai/model-config";

export interface LiveChatSuggestInput {
  visitorName: string | null;
  visitorMessage: string;
  conversationHistory: Array<{
    role: "visitor" | "agent";
    text: string;
    createdAt: string;
  }>;
  departmentName?: string | null;
  agentName?: string;
}

export interface LiveChatSuggestion {
  suggestions: string[];
  confidence: "high" | "medium" | "low";
  intent: string;
  generatedAt: string;
  fallback: boolean;
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 20000);

function fallbackSuggestions(input: LiveChatSuggestInput): LiveChatSuggestion {
  const name = input.visitorName ?? "there";
  const message = input.visitorMessage.toLowerCase();

  let suggestions: string[];
  let intent = "general_inquiry";

  if (message.includes("price") || message.includes("cost") || message.includes("how much")) {
    intent = "pricing_inquiry";
    suggestions = [
      `Hi ${name}! I'd be happy to share pricing details with you.`,
      "Could you let me know which product or plan you're interested in?",
      "Our pricing starts from different tiers. Would you like me to walk you through options?",
    ];
  } else if (message.includes("help") || message.includes("problem") || message.includes("issue") || message.includes("error")) {
    intent = "support_request";
    suggestions = [
      `Hi ${name}, I'm here to help. Could you describe the issue in more detail?`,
      "I understand you're experiencing a problem. Let me look into this for you.",
      "Could you share what steps you've already tried?",
    ];
  } else if (message.includes("hello") || message.includes("hi") || message.includes("hey")) {
    intent = "greeting";
    suggestions = [
      `Hello ${name}! How can I assist you today?`,
      `Hi ${name}! Welcome. What can I help you with?`,
      `Hey ${name}! Great to have you here. What brings you in today?`,
    ];
  } else {
    suggestions = [
      `Hi ${name}, thanks for reaching out! How can I assist you?`,
      "I'd be happy to help. Could you provide more details?",
      "Thanks for your message. Let me check this for you right away.",
    ];
  }

  return {
    suggestions,
    confidence: "medium",
    intent,
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
        options: { temperature: 0.4 },
        messages: [
          {
            role: "system",
            content:
              "You are a live chat support assistant AI. Suggest 3 short, helpful, natural replies for agents. Return JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) throw new Error(`AI error (${response.status})`);

    const payload = (await response.json()) as { message?: { content?: string } };
    const content = payload.message?.content;
    if (!content?.trim()) throw new Error("Empty AI response");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(input: LiveChatSuggestInput): string {
  const history = input.conversationHistory.slice(-6);
  return [
    "Suggest 3 short reply options for a live chat support agent.",
    "Return JSON: { \"suggestions\": [\"string\",\"string\",\"string\"], \"intent\": \"string\", \"confidence\": \"high|medium|low\" }",
    "Rules: replies must be natural, concise (1-2 sentences), and helpful. No markdown.",
    `Visitor name: ${input.visitorName ?? "Unknown"}`,
    `Department: ${input.departmentName ?? "General Support"}`,
    `Latest visitor message: ${input.visitorMessage}`,
    `Recent conversation: ${JSON.stringify(history)}`,
  ].join("\n");
}

export async function generateLiveChatSuggestions(
  input: LiveChatSuggestInput
): Promise<LiveChatSuggestion> {
  try {
    const model = await getOllamaModel();
    const raw = await callOllama(buildPrompt(input), model);

    const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as Record<string, unknown>;

    const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean)
      .slice(0, 3);

    if (suggestions.length === 0) return fallbackSuggestions(input);

    const confidence = (["high", "medium", "low"].includes(parsed.confidence as string)
      ? parsed.confidence
      : "medium") as LiveChatSuggestion["confidence"];

    return {
      suggestions,
      confidence,
      intent: typeof parsed.intent === "string" ? parsed.intent : "general_inquiry",
      generatedAt: new Date().toISOString(),
      fallback: false,
    };
  } catch {
    return fallbackSuggestions(input);
  }
}
