import { NextRequest, NextResponse } from "next/server";
import { verifyWidgetSessionToken } from "@/lib/livechat-widget-auth";
import { setTyping, getTypers } from "@/lib/typing-store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dialogId: string }> }
) {
  const { dialogId } = await params;
  const body = (await req.json().catch(() => ({}))) as { sessionToken?: string; visitorName?: string };
  if (!body.sessionToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const valid = verifyWidgetSessionToken(dialogId, body.sessionToken);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = body.visitorName?.trim() || "Visitor";
  setTyping(dialogId, `visitor_${dialogId}`, name);
  return NextResponse.json({ ok: true });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dialogId: string }> }
) {
  const { dialogId } = await params;
  const sessionToken = req.nextUrl.searchParams.get("sessionToken");
  if (!sessionToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const valid = verifyWidgetSessionToken(dialogId, sessionToken);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // For visitor, only show AGENT typers (exclude visitor's own entry)
  const agentTypers = getTypers(dialogId, `visitor_${dialogId}`);
  return NextResponse.json({ typers: agentTypers });
}
