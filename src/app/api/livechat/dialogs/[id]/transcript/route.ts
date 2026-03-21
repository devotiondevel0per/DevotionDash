import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("livechat", "read");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;

  const dialog = await prisma.chatDialog.findFirst({
    where: { id, isExternal: true },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { name: true, fullname: true } } },
      },
    },
  });

  if (!dialog) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lines: string[] = [
    `Chat Transcript`,
    `================`,
    `Subject: ${dialog.subject || "(no subject)"}`,
    `Visitor: ${dialog.visitorName || dialog.visitorEmail || "Unknown"}`,
    `Status: ${dialog.status}`,
    `Date: ${dialog.createdAt.toISOString()}`,
    ``,
    `Messages:`,
    `─────────`,
  ];

  for (const msg of dialog.messages) {
    if (msg.isSystem) continue;
    let text = msg.content;
    try { const p = JSON.parse(msg.content) as { text?: string }; if (p.text) text = p.text; } catch {}
    const sender = msg.userId ? (msg.user?.fullname || msg.user?.name || "Agent") : (dialog.visitorName || "Visitor");
    const ts = msg.createdAt.toLocaleString();
    lines.push(`[${ts}] ${sender}:`);
    lines.push(`  ${text}`);
    lines.push(``);
  }

  const content = lines.join("\n");
  const filename = `transcript_${id}_${new Date().toISOString().slice(0,10)}.txt`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
