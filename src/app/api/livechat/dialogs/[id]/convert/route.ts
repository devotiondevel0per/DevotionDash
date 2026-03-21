import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { parseMessagePayload } from "@/lib/chat-message";
import { canAccessLiveChatDialog } from "@/lib/livechat-access";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

function inferCompanyName(visitorEmail: string | null | undefined, visitorName: string | null | undefined) {
  const email = (visitorEmail ?? "").trim().toLowerCase();
  if (email.includes("@")) {
    const domain = email.split("@")[1] ?? "";
    const base = domain.split(".")[0] ?? "";
    if (base && !["gmail", "outlook", "hotmail", "yahoo", "icloud"].includes(base)) {
      return `${base[0]?.toUpperCase() ?? ""}${base.slice(1)} LLC`;
    }
  }
  const fallback = (visitorName ?? "").trim();
  return fallback ? `${fallback} Company` : "Live Chat Lead";
}

function inferPriority(text: string) {
  const normalized = text.toLowerCase();
  if (/(critical|urgent|asap|immediately|blocked|down|cannot|can't)/.test(normalized)) {
    return "high";
  }
  if (/(whenever|low priority|later|not urgent)/.test(normalized)) {
    return "low";
  }
  return "normal";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const liveAccess = await requireModuleAccess("livechat", "write");
  if (!liveAccess.ok) return liveAccess.response;

  const leadsAccess = await requireModuleAccess("leads", "write");
  if (!leadsAccess.ok) return leadsAccess.response;

  try {
    const { id } = await params;

    const dialog = await prisma.chatDialog.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                fullname: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 250,
        },
      },
    });

    if (!dialog || !dialog.isExternal) {
      return NextResponse.json({ error: "Live chat dialog not found" }, { status: 404 });
    }

    const memberIds = dialog.members.map((member) => member.userId);
    if (!canAccessLiveChatDialog(liveAccess.ctx.access, liveAccess.ctx.userId, memberIds)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const marker = `[#livechat:${dialog.id}]`;
    const existing = await prisma.lead.findFirst({
      where: {
        source: "Live Chat",
        notes: { contains: marker },
      },
      select: {
        id: true,
        title: true,
        stage: true,
        status: true,
        ownerId: true,
      },
    });

    if (existing) {
      return NextResponse.json({
        existing: true,
        message: "This conversation is already converted to a lead.",
        lead: existing,
      });
    }

    const transcript = dialog.messages
      .map((message) => {
        const payload = parseMessagePayload(message.content).payload;
        return payload.text.trim();
      })
      .filter(Boolean)
      .slice(-20);

    const transcriptText = transcript.join("\n");
    const priority = inferPriority(transcriptText || dialog.subject || "");
    const ownerId = dialog.members[0]?.userId ?? liveAccess.ctx.userId;
    const companyName = inferCompanyName(dialog.visitorEmail, dialog.visitorName);

    const noteLines = [
      marker,
      `Conversation subject: ${dialog.subject?.trim() || dialog.visitorName?.trim() || "Live chat session"}`,
      transcript.length > 0 ? "Transcript:" : "No transcript available.",
      ...transcript.map((line) => `- ${line}`),
    ];

    const createdLead = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          title: `Live Chat: ${dialog.subject?.trim() || dialog.visitorName?.trim() || dialog.id.slice(0, 8)}`,
          companyName,
          contactName: dialog.visitorName?.trim() || null,
          email: dialog.visitorEmail?.trim() || null,
          source: "Live Chat",
          priority,
          stage: "new",
          status: "open",
          ownerId,
          notes: noteLines.join("\n"),
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: liveAccess.ctx.userId,
          type: "system",
          content: `Lead created from live chat dialog ${dialog.id}.`,
        },
      });

      await tx.chatMessage.create({
        data: {
          dialogId: dialog.id,
          userId: liveAccess.ctx.userId,
          isSystem: true,
          content: `Lead created: ${lead.title} (${lead.id}).`,
        },
      });

      await tx.chatDialog.update({
        where: { id: dialog.id },
        data: { updatedAt: new Date() },
      });

      return lead;
    });

    if (ownerId !== liveAccess.ctx.userId) {
      await prisma.notification.create({
        data: {
          userId: ownerId,
          type: "leads",
          title: "Lead assigned from live chat",
          body: `${createdLead.title} was assigned to you from a livechat conversation.`,
          link: `/leads`,
          isRead: false,
        },
      });
    }

    await writeAuditLog({
      userId: liveAccess.ctx.userId,
      action: "LIVECHAT_CONVERTED_TO_LEAD",
      module: "livechat",
      targetId: dialog.id,
      details: JSON.stringify({ leadId: createdLead.id, ownerId }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({
      existing: false,
      message: "Conversation converted to lead.",
      lead: {
        id: createdLead.id,
        title: createdLead.title,
        stage: createdLead.stage,
        status: createdLead.status,
        ownerId: createdLead.ownerId,
      },
    });
  } catch (error) {
    console.error("[POST /api/livechat/dialogs/[id]/convert]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
