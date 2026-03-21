import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { getOllamaModel } from "@/lib/ai/model-config";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const TIMEOUT_MS = 30_000;

function stripFence(raw: string) {
  const t = raw.trim();
  if (!t.startsWith("```")) return t;
  return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("email", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { prompt, tone = "professional", length = "standard", context = "" } =
      (await req.json()) as {
        prompt?: string;
        tone?: string;
        length?: string;
        context?: string;
      };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const lengthGuide =
      length === "brief"
        ? "2-3 short sentences"
        : length === "detailed"
          ? "3-5 paragraphs with detail"
          : "1-2 paragraphs";

    const systemPrompt = `You are an expert email writer. Write professional business emails.
Always return valid JSON only with this exact structure:
{"subject":"string","body":"string"}
No markdown, no explanation, only the JSON object.`;

    const userPrompt = [
      "Write an email with these requirements:",
      `Request: ${prompt.trim()}`,
      `Tone: ${tone}`,
      `Length: ${lengthGuide}`,
      context ? `Additional context: ${context}` : "",
      'Return only JSON: {"subject":"...","body":"..."}',
    ]
      .filter(Boolean)
      .join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let subject = "";
    let body = "";

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
          options: { temperature: 0.7 },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { message?: { content?: string } };
        const raw = data.message?.content ?? "";
        const parsed = JSON.parse(stripFence(raw)) as { subject?: string; body?: string };
        subject = parsed.subject?.trim() ?? "";
        body = parsed.body?.trim() ?? "";
      }
    } catch {
      // AI unavailable - use template fallback
    } finally {
      clearTimeout(timeout);
    }

    if (!subject || !body) {
      subject = `Re: ${prompt.trim().slice(0, 60)}`;
      body = `Dear [Recipient],\n\nI hope this email finds you well.\n\n${prompt.trim()}\n\nBest regards,\n[Your Name]`;
    }

    return NextResponse.json({ subject, body });
  } catch (error) {
    console.error("[POST /api/email/ai/compose]", error);
    return NextResponse.json({ error: "Failed to generate email" }, { status: 500 });
  }
}
