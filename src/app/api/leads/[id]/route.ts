import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  isTerminalLeadStage,
  loadLeadStageFlow,
  normalizeLeadStage,
  statusForLeadStage,
  toLeadStageLabel,
} from "@/lib/leads";

function canAccess(ctx: { access: { isAdmin: boolean; permissions: { leads: { manage: boolean } } }; userId: string }, ownerId: string | null) {
  return ctx.access.isAdmin || ctx.access.permissions.leads.manage || ownerId === ctx.userId;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("leads", "read");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  const { userId, access } = accessResult.ctx;

  try {
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, fullname: true } },
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        activities: {
          include: { user: { select: { id: true, name: true, fullname: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canAccess({ access, userId }, lead.ownerId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      ...lead,
      expectedDeposit: lead.expectedDeposit ? Number(lead.expectedDeposit) : null,
      followUpAt: lead.followUpAt?.toISOString() ?? null,
      closedAt: lead.closedAt?.toISOString() ?? null,
      customData: lead.customData ? (() => { try { return JSON.parse(lead.customData!); } catch { return null; } })() : null,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      activities: lead.activities.map((a) => ({
        ...a,
        scheduledAt: a.scheduledAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[GET /api/leads/[id]]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(
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
    if (!canAccess({ access, userId }, lead.ownerId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json() as {
      title?: string;
      companyName?: string;
      contactName?: string | null;
      email?: string | null;
      phone?: string | null;
      country?: string | null;
      language?: string | null;
      source?: string | null;
      priority?: string;
      stage?: string;
      expectedDeposit?: number | null;
      score?: number;
      notes?: string | null;
      followUpAt?: string | null;
      customData?: Record<string, unknown> | null;
      ownerId?: string | null;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (body.title !== undefined) data.title = body.title.trim();
    if (body.companyName !== undefined) data.companyName = body.companyName.trim();
    if ("contactName" in body) data.contactName = body.contactName?.trim() || null;
    if ("email" in body) data.email = body.email?.trim() || null;
    if ("phone" in body) data.phone = body.phone?.trim() || null;
    if ("country" in body) data.country = body.country?.trim() || null;
    if ("language" in body) data.language = body.language?.trim() || null;
    if ("source" in body) data.source = body.source?.trim() || null;
    if (body.priority && ["low", "normal", "high"].includes(body.priority)) data.priority = body.priority;
    if (typeof body.score === "number") data.score = Math.max(0, Math.min(100, body.score));
    if ("expectedDeposit" in body) data.expectedDeposit = body.expectedDeposit ?? null;
    if ("notes" in body) data.notes = body.notes || null;
    if ("followUpAt" in body) data.followUpAt = body.followUpAt ? new Date(body.followUpAt) : null;
    if ("customData" in body) data.customData = body.customData ? JSON.stringify(body.customData) : null;
    if (access.isAdmin || access.permissions.leads.manage) {
      if ("ownerId" in body) data.ownerId = body.ownerId || null;
    }

    let stageChanged = false;
    if (body.stage !== undefined) {
      const stageFlow = await loadLeadStageFlow();
      const normalized = normalizeLeadStage(body.stage);
      const allowed = new Set([...stageFlow, "lost", "archived"]);
      if (!allowed.has(normalized)) {
        return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
      }
      if (normalized !== lead.stage) {
        data.stage = normalized;
        data.status = statusForLeadStage(normalized);
        if (isTerminalLeadStage(normalized)) data.closedAt = new Date();
        stageChanged = true;
      }
    }

    const updated = await prisma.lead.update({
      where: { id },
      data,
      include: {
        owner: { select: { id: true, name: true, fullname: true } },
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        activities: {
          include: { user: { select: { id: true, name: true, fullname: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (stageChanged) {
      await prisma.leadActivity.create({
        data: {
          leadId: id,
          userId,
          type: "stage_change",
          content: `Stage changed from '${toLeadStageLabel(lead.stage)}' to '${toLeadStageLabel(data.stage as string)}'.`,
        },
      });
    }

    return NextResponse.json({
      ...updated,
      expectedDeposit: updated.expectedDeposit ? Number(updated.expectedDeposit) : null,
      followUpAt: updated.followUpAt?.toISOString() ?? null,
      closedAt: updated.closedAt?.toISOString() ?? null,
      customData: updated.customData ? (() => { try { return JSON.parse(updated.customData!); } catch { return null; } })() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      activities: updated.activities.map((a) => ({
        ...a,
        scheduledAt: a.scheduledAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[PATCH /api/leads/[id]]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("leads", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  const { userId, access } = accessResult.ctx;

  try {
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canAccess({ access, userId }, lead.ownerId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.lead.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/leads/[id]]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
