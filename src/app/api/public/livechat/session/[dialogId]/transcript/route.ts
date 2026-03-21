import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWidgetSessionToken } from "@/lib/livechat-widget-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dialogId: string }> }
) {
  const { dialogId } = await params;
  const sessionToken = req.nextUrl.searchParams.get("sessionToken");
  if (!sessionToken || !verifyWidgetSessionToken(dialogId, sessionToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dialog = await prisma.chatDialog.findFirst({
    where: { id: dialogId, isExternal: true },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        where: { isSystem: false },
        include: { user: { select: { name: true, fullname: true } } },
      },
    },
  });

  if (!dialog) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lines: string[] = [
    `Chat Transcript — ${dialog.subject || "Support Chat"}`,
    `Date: ${dialog.createdAt.toLocaleDateString()}`,
    ``,
  ];

  for (const msg of dialog.messages) {
    let text = msg.content;
    try { const p = JSON.parse(msg.content) as { text?: string }; if (p.text) text = p.text; } catch {}
    const sender = msg.userId ? "Support Agent" : (dialog.visitorName || "You");
    const ts = msg.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    lines.push(`[${ts}] ${sender}: ${text}`);
  }

  const content = lines.join("\n");
  const filename = `chat_transcript_${new Date().toISOString().slice(0,10)}.txt`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
