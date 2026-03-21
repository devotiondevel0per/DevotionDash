import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

const VALID_TYPES = ["note", "call", "email", "meeting", "follow_up", "system"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("leads", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  const { userId, access } = accessResult.ctx;

  try {
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isAllowed =
      access.isAdmin || access.permissions.leads.manage || lead.ownerId === userId;
    if (!isAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json() as {
      type?: string;
      content?: string;
      scheduledAt?: string | null;
      metadata?: Record<string, unknown>;
    };

    if (!body.content?.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const type = VALID_TYPES.includes(body.type ?? "") ? (body.type as string) : "note";
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

    const activity = await prisma.leadActivity.create({
      data: {
        leadId: id,
        userId,
        type,
        content: body.content.trim(),
        scheduledAt,
        metadata: body.metadata ? JSON.stringify(body.metadata) : null,
      },
      include: { user: { select: { id: true, name: true, fullname: true } } },
    });

    // If scheduling a follow-up, update the lead's followUpAt
    if (type === "follow_up" && scheduledAt) {
      await prisma.lead.update({
        where: { id },
        data: { followUpAt: scheduledAt },
      });
    }

    return NextResponse.json({
      ...activity,
      scheduledAt: activity.scheduledAt?.toISOString() ?? null,
      createdAt: activity.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/leads/[id]/activities]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
