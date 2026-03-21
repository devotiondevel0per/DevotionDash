import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { getOllamaModel } from "@/lib/ai/model-config";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const TIMEOUT_MS = 25_000;

function stripFence(raw: string) {
  const t = raw.trim();
  if (!t.startsWith("```")) return t;
  return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("email", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { subject, body } = (await req.json()) as { subject?: string; body?: string };

    if (!body?.trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const content = [subject ? `Subject: ${subject}` : "", body].filter(Boolean).join("\n\n");
    const truncated = content.slice(0, 4000);

    const systemPrompt = `You summarize emails concisely. Return only valid JSON.
Structure: {"summary":"1-2 sentence summary","keyPoints":["point1","point2","point3"],"sentiment":"positive|neutral|negative","actionRequired":true|false}`;

    const userPrompt = `Summarize this email:\n\n${truncated}\n\nReturn only JSON.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let summary = "";
    let keyPoints: string[] = [];
    let sentiment = "neutral";
    let actionRequired = false;

    try {
      const model = await getOllamaModel();
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
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { message?: { content?: string } };
        const raw = data.message?.content ?? "";
        const parsed = JSON.parse(stripFence(raw)) as {
          summary?: string;
          keyPoints?: string[];
          sentiment?: string;
          actionRequired?: boolean;
        };
        summary = parsed.summary?.trim() ?? "";
        keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 5) : [];
        sentiment = ["positive", "neutral", "negative"].includes(parsed.sentiment ?? "")
          ? (parsed.sentiment ?? "neutral")
          : "neutral";
        actionRequired = Boolean(parsed.actionRequired);
      }
    } catch {
      // AI unavailable
    } finally {
      clearTimeout(timeout);
    }

    if (!summary) {
      const words = body.trim().split(/\s+/).slice(0, 30).join(" ");
      summary = words.length < body.trim().split(/\s+/).length ? `${words}...` : words;
    }
    if (!keyPoints.length) {
      const sentences = body
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 20)
        .slice(0, 3);
      keyPoints = sentences.length ? sentences : ["See full email for details"];
    }

    return NextResponse.json({ summary, keyPoints, sentiment, actionRequired });
  } catch (error) {
    console.error("[POST /api/email/ai/summarize]", error);
    return NextResponse.json({ error: "Failed to summarize email" }, { status: 500 });
  }
}
