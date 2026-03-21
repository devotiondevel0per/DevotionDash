import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { prisma } from "@/lib/prisma";
import { generateLiveChatSuggestions } from "@/lib/ai/livechat-suggest";

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("livechat", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as { dialogId?: string; message?: string };

    if (!body.dialogId) {
      return NextResponse.json({ error: "dialogId is required" }, { status: 400 });
    }

    // Load dialog with recent messages
    const dialog = await prisma.chatDialog.findFirst({
      where: { id: body.dialogId, isExternal: true },
      include: {
        department: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            content: true,
            isSystem: true,
            createdAt: true,
            userId: true,
          },
        },
      },
    });

    if (!dialog) {
      return NextResponse.json({ error: "Dialog not found" }, { status: 404 });
    }

    // Parse messages to get conversation history
    const history = dialog.messages
      .reverse()
      .filter((m) => !m.isSystem)
      .map((m) => {
        // Visitor has no userId (external), agent has userId
        const isVisitor = !m.userId || m.userId === dialog.visitorEmail;
        let text = m.content;
        try {
          const payload = JSON.parse(m.content) as { text?: string };
          if (payload.text) text = payload.text;
        } catch {
          // use raw content
        }
        return {
          role: (isVisitor ? "visitor" : "agent") as "visitor" | "agent",
          text,
          createdAt: m.createdAt.toISOString(),
        };
      });

    const latestVisitorMsg =
      body.message ??
      history.filter((m) => m.role === "visitor").at(-1)?.text ??
      history.at(-1)?.text ??
      dialog.subject ??
      "";

    // Get current agent name
    const agent = await prisma.user.findUnique({
      where: { id: accessResult.ctx.userId },
      select: { name: true, fullname: true },
    });

    const result = await generateLiveChatSuggestions({
      visitorName: dialog.visitorName,
      visitorMessage: latestVisitorMsg,
      conversationHistory: history,
      departmentName: dialog.department?.name ?? null,
      agentName: agent?.fullname || agent?.name || "Agent",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/livechat/ai-suggest]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
