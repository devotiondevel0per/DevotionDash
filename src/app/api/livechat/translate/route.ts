import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("livechat", "read");
  if (!accessResult.ok) return accessResult.response;

  const body = (await req.json()) as { text?: string; targetLang?: string; sourceLang?: string };
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

  const targetLang = body.targetLang?.trim() || "English";
  const sourceLang = body.sourceLang?.trim() || "auto";

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Translate the following text to ${targetLang}${sourceLang !== "auto" ? ` from ${sourceLang}` : ""}. Return ONLY the translated text, nothing else, no quotes, no explanations.\n\nText: ${text}`,
        },
      ],
    });

    const translated = (msg.content[0] as { type: string; text: string }).text?.trim() || text;
    return NextResponse.json({ translated, original: text });
  } catch (error) {
    console.error("[POST /api/livechat/translate]", error);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
