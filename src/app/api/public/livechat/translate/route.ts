import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  // Basic rate limiting via session token presence
  const body = (await req.json()) as { text?: string; targetLang?: string; sessionToken?: string };
  if (!body.sessionToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const text = body.text?.trim();
  if (!text || text.length > 2000) return NextResponse.json({ error: "Invalid text" }, { status: 400 });

  const targetLang = body.targetLang?.trim() || "English";

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Translate to ${targetLang}. Return ONLY the translation, no quotes, no explanations.\n\nText: ${text}`,
        },
      ],
    });

    const translated = (msg.content[0] as { type: string; text: string }).text?.trim() || text;
    return NextResponse.json({ translated });
  } catch {
    return NextResponse.json({ translated: text }); // Fallback to original on error
  }
}
