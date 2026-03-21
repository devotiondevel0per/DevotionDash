import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { setTyping, getTypers } from "@/lib/typing-store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("livechat", "write");
  if (!accessResult.ok) return accessResult.response;
  const { id: dialogId } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim() || "Agent";
  setTyping(dialogId, accessResult.ctx.userId, name);
  return NextResponse.json({ ok: true });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("livechat", "read");
  if (!accessResult.ok) return accessResult.response;
  const { id: dialogId } = await params;
  const typers = getTypers(dialogId, accessResult.ctx.userId);
  return NextResponse.json({ typers });
}
