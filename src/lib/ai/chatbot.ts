/**
 * Chatbot service — handles AI-powered auto-responses in live chat
 *
 * Architecture:
 * - When a dialog has botMode=true, incoming visitor messages are auto-processed
 * - The AI responds using conversation history and any trained knowledge base
 * - Transfer to human agent when:
 *   1. Visitor explicitly asks ("talk to a human", "live agent", "real person")
 *   2. AI confidence is below threshold
 *   3. Topic is flagged for human escalation
 *
 * Future integration points:
 * - Train on company FAQ, product docs, past conversations
 * - Fine-tune Claude model on company-specific data
 * - Add vector similarity search for relevant knowledge retrieval
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const TRANSFER_TRIGGERS = [
  "talk to a human",
  "live agent",
  "real person",
  "speak to someone",
  "human support",
  "connect me to",
  "transfer me",
];

export function detectTransferRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return TRANSFER_TRIGGERS.some((trigger) => lower.includes(trigger));
}

export async function generateBotResponse(params: {
  visitorMessage: string;
  conversationHistory: Array<{ role: "visitor" | "agent"; text: string }>;
  brandLabel?: string;
  systemPrompt?: string;
}): Promise<{ response: string; shouldTransfer: boolean; confidence: "high" | "medium" | "low" }> {
  if (detectTransferRequest(params.visitorMessage)) {
    return {
      response: "I'll connect you with a live agent right away. Please hold on for a moment.",
      shouldTransfer: true,
      confidence: "high",
    };
  }

  const systemPrompt = params.systemPrompt ||
    `You are a helpful customer support assistant for ${params.brandLabel || "our company"}.
    Be concise, friendly, and helpful. If you cannot answer confidently, say so and offer to transfer to a human agent.
    If the user asks to speak to a human, immediately indicate transfer.`;

  const messages: Anthropic.Messages.MessageParam[] = [
    ...params.conversationHistory.slice(-10).map((m) => ({
      role: (m.role === "visitor" ? "user" : "assistant") as "user" | "assistant",
      content: m.text,
    })),
    { role: "user", content: params.visitorMessage },
  ];

  const result = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: systemPrompt,
    messages,
  });

  const response = (result.content[0] as { type: string; text: string }).text?.trim() || "I'm sorry, I couldn't process that.";
  const shouldTransfer = detectTransferRequest(response) || response.includes("transfer");
  const confidence = result.stop_reason === "end_turn" ? "high" : "low";

  return { response, shouldTransfer, confidence };
}
