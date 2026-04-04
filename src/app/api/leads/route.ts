import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  loadLeadCustomFields,
  loadLeadFormFields,
  loadLeadSourceOptions,
  loadLeadStageFlow,
  normalizeLeadStage,
  statusForLeadStage,
  toLeadStageLabel,
} from "@/lib/leads";

function toLeadResponse(lead: {
  id: string;
  title: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  language: string | null;
  source: string | null;
  priority: string;
  stage: string;
  status: string;
  expectedDeposit: Prisma.Decimal | null;
  score: number;
  notes: string | null;
  followUpAt: Date | null;
  closedAt: Date | null;
  customData: string | null;
  ownerId: string | null;
  organizationId: string | null;
  contactId: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; name: string; fullname: string } | null;
  organization: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  _count: { activities: number };
}) {
  return {
    id: lead.id,
    title: lead.title,
    companyName: lead.companyName,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    country: lead.country,
    language: lead.language,
    source: lead.source,
    priority: lead.priority,
    stage: lead.stage,
    stageLabel: toLeadStageLabel(lead.stage),
    status: lead.status,
    expectedDeposit: lead.expectedDeposit ? Number(lead.expectedDeposit) : null,
    score: lead.score,
    notes: lead.notes,
    followUpAt: lead.followUpAt?.toISOString() ?? null,
    closedAt: lead.closedAt?.toISOString() ?? null,
    customData: lead.customData ? (() => { try { return JSON.parse(lead.customData!); } catch { return null; } })() : null,
    ownerId: lead.ownerId,
    organizationId: lead.organizationId,
    contactId: lead.contactId,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    owner: lead.owner,
    organization: lead.organization,
    contact: lead.contact,
    activitiesCount: lead._count.activities,
  };
}

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("leads", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;
    const roleGroupIds = accessResult.ctx.access.roles
      .map((role) => role.groupId)
      .filter((groupId): groupId is string => Boolean(groupId));
    const canManageLeads = accessResult.ctx.access.isAdmin || accessResult.ctx.access.permissions.leads.manage;

    const { searchParams } = new URL(req.url);
    const stage = searchParams.get("stage")?.trim().toLowerCase();
    const status = searchParams.get("status")?.trim().toLowerCase();
    const ownerId = searchParams.get("ownerId")?.trim();
    const search = searchParams.get("search")?.trim();
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "120", 10), 1),
      500
    );

    const where: Prisma.LeadWhereInput = {};
    const and: Prisma.LeadWhereInput[] = [];
    if (!accessResult.ctx.access.isAdmin && !accessResult.ctx.access.permissions.leads.manage) {
      and.push({ ownerId: accessResult.ctx.userId });
    }

    if (stage && stage !== "all") {
      and.push({ stage });
    }

    if (status && status !== "all") {
      and.push({ status });
    }

    if (ownerId && ownerId !== "all") {
      if (ownerId === "me") {
        and.push({ ownerId: accessResult.ctx.userId });
      } else {
        and.push({ ownerId });
      }
    }

    if (search) {
      and.push({
        OR: [
          { title: { contains: search } },
          { companyName: { contains: search } },
          { contactName: { contains: search } },
          { email: { contains: search } },
          { phone: { contains: search } },
          { country: { contains: search } },
          { source: { contains: search } },
          { notes: { contains: search } },
        ],
      });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    const userWhere = canManageLeads
      ? { isActive: true }
      : roleGroupIds.length > 0
        ? {
            OR: [
              { id: userId },
              {
                groupMembers: {
                  some: {
                    groupId: { in: roleGroupIds },
                  },
                },
              },
            ],
            isActive: true,
          }
        : { id: userId, isActive: true };

    const [stageFlow, sourceOptions, formFields, customFields, leadsBase, owners] = await Promise.all([
      loadLeadStageFlow(),
      loadLeadSourceOptions(),
      loadLeadFormFields(),
      loadLeadCustomFields(),
      prisma.lead.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: limit,
        select: {
          id: true,
          title: true,
          companyName: true,
          contactName: true,
          email: true,
          phone: true,
          country: true,
          language: true,
          source: true,
          priority: true,
          stage: true,
          status: true,
          expectedDeposit: true,
          score: true,
          notes: true,
          followUpAt: true,
          closedAt: true,
          customData: true,
          ownerId: true,
          organizationId: true,
          contactId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          name: true,
          fullname: true,
          email: true,
        },
        orderBy: [{ fullname: "asc" }, { name: "asc" }],
        take: 500,
      }),
    ]);

    const ownerIds = Array.from(new Set(leadsBase.map((lead) => lead.ownerId).filter(Boolean))) as string[];
    const organizationIds = Array.from(
      new Set(leadsBase.map((lead) => lead.organizationId).filter(Boolean))
    ) as string[];
    const contactIds = Array.from(new Set(leadsBase.map((lead) => lead.contactId).filter(Boolean))) as string[];
    const leadIds = leadsBase.map((lead) => lead.id);

    const [ownersResult, organizationsResult, contactsResult, activitiesResult] = await Promise.all([
      ownerIds.length > 0
        ? prisma.user
            .findMany({
              where: { id: { in: ownerIds } },
              select: { id: true, name: true, fullname: true },
            })
            .then((rows) => ({ ok: true as const, rows }))
            .catch(() => ({ ok: false as const, rows: [] as Array<{ id: string; name: string; fullname: string }> }))
        : Promise.resolve({ ok: true as const, rows: [] as Array<{ id: string; name: string; fullname: string }> }),
      organizationIds.length > 0
        ? prisma.organization
            .findMany({
              where: { id: { in: organizationIds } },
              select: { id: true, name: true },
            })
            .then((rows) => ({ ok: true as const, rows }))
            .catch(() => ({ ok: false as const, rows: [] as Array<{ id: string; name: string }> }))
        : Promise.resolve({ ok: true as const, rows: [] as Array<{ id: string; name: string }> }),
      contactIds.length > 0
        ? prisma.contact
            .findMany({
              where: { id: { in: contactIds } },
              select: { id: true, firstName: true, lastName: true },
            })
            .then((rows) => ({ ok: true as const, rows }))
            .catch(
              () =>
                ({
                  ok: false as const,
                  rows: [] as Array<{ id: string; firstName: string; lastName: string }>,
                })
            )
        : Promise.resolve({
            ok: true as const,
            rows: [] as Array<{ id: string; firstName: string; lastName: string }>,
          }),
      leadIds.length > 0
        ? prisma.leadActivity
            .groupBy({
              by: ["leadId"],
              where: { leadId: { in: leadIds } },
              _count: { leadId: true },
            })
            .then((rows) => ({ ok: true as const, rows }))
            .catch(
              () =>
                ({
                  ok: false as const,
                  rows: [] as Array<{ leadId: string; _count: { leadId: number } }>,
                })
            )
        : Promise.resolve({
            ok: true as const,
            rows: [] as Array<{ leadId: string; _count: { leadId: number } }>,
          }),
    ]);

    const ownerMap = new Map(ownersResult.rows.map((row) => [row.id, row]));
    const organizationMap = new Map(organizationsResult.rows.map((row) => [row.id, row]));
    const contactMap = new Map(contactsResult.rows.map((row) => [row.id, row]));
    const activityMap = new Map(
      activitiesResult.rows.map((row) => [row.leadId, row._count.leadId])
    );

    const leads = leadsBase.map((lead) => ({
      ...lead,
      owner: lead.ownerId ? ownerMap.get(lead.ownerId) ?? null : null,
      organization: lead.organizationId ? organizationMap.get(lead.organizationId) ?? null : null,
      contact: lead.contactId ? contactMap.get(lead.contactId) ?? null : null,
      _count: { activities: activityMap.get(lead.id) ?? 0 },
    }));

    return NextResponse.json({
      stageFlow,
      sourceOptions,
      formFields,
      customFields,
      owners: owners.map((owner) => ({
        id: owner.id,
        name: owner.name,
        fullname: owner.fullname,
        email: owner.email,
      })),
      currentUserId: userId,
      leads: leads.map(toLeadResponse),
    });
  } catch (error) {
    console.error("[GET /api/leads]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("leads", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as {
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
      expectedDeposit?: number | string | null;
      score?: number;
      notes?: string | null;
      customData?: Record<string, unknown> | null;
      ownerId?: string | null;
      organizationId?: string | null;
      contactId?: string | null;
    };

    const title = body.title?.trim() ?? "";
    const companyName = body.companyName?.trim() ?? "";

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    if (!companyName) {
      return NextResponse.json({ error: "companyName is required" }, { status: 400 });
    }

    if (
      !accessResult.ctx.access.isAdmin &&
      body.ownerId &&
      body.ownerId !== accessResult.ctx.userId
    ) {
      return NextResponse.json(
        { error: "Forbidden: you can only assign leads to yourself" },
        { status: 403 }
      );
    }

    const [stageFlow, owner, organization, contact] = await Promise.all([
      loadLeadStageFlow(),
      body.ownerId
        ? prisma.user.findUnique({ where: { id: body.ownerId }, select: { id: true } })
        : Promise.resolve({ id: accessResult.ctx.userId }),
      body.organizationId
        ? prisma.organization.findUnique({ where: { id: body.organizationId }, select: { id: true } })
        : Promise.resolve(null),
      body.contactId
        ? prisma.contact.findUnique({ where: { id: body.contactId }, select: { id: true } })
        : Promise.resolve(null),
    ]);

    if (!owner) {
      return NextResponse.json({ error: "Invalid ownerId" }, { status: 400 });
    }

    if (body.organizationId && !organization) {
      return NextResponse.json({ error: "Invalid organizationId" }, { status: 400 });
    }

    if (body.contactId && !contact) {
      return NextResponse.json({ error: "Invalid contactId" }, { status: 400 });
    }

    const allowedStages = new Set([...stageFlow, "lost", "archived"]);
    const stage = normalizeLeadStage(body.stage ?? stageFlow[0]);
    if (!allowedStages.has(stage)) {
      return NextResponse.json(
        { error: `Invalid stage. Allowed stages: ${Array.from(allowedStages).join(", ")}` },
        { status: 400 }
      );
    }

    const expectedDeposit =
      body.expectedDeposit === undefined || body.expectedDeposit === null || body.expectedDeposit === ""
        ? null
        : Number(body.expectedDeposit);

    if (expectedDeposit !== null && Number.isNaN(expectedDeposit)) {
      return NextResponse.json({ error: "expectedDeposit must be a number" }, { status: 400 });
    }

    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          title,
          companyName,
          contactName: body.contactName?.trim() || null,
          email: body.email?.trim() || null,
          phone: body.phone?.trim() || null,
          country: body.country?.trim() || null,
          language: body.language?.trim() || null,
          source: body.source?.trim() || null,
          priority: body.priority?.trim() || "normal",
          stage,
          status: statusForLeadStage(stage),
          expectedDeposit,
          score: Number.isFinite(body.score) ? Math.max(0, Math.min(100, Number(body.score))) : 0,
          notes: body.notes?.trim() || null,
          customData: body.customData ? JSON.stringify(body.customData) : null,
          ownerId: owner.id,
          organizationId: body.organizationId || null,
          contactId: body.contactId || null,
        },
        include: {
          owner: { select: { id: true, name: true, fullname: true } },
          organization: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { activities: true } },
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId: created.id,
          userId: accessResult.ctx.userId,
          type: "system",
          content: `Lead created in stage '${toLeadStageLabel(stage)}'.`,
        },
      });

      return created;
    });

    return NextResponse.json(toLeadResponse(lead), { status: 201 });
  } catch (error) {
    console.error("[POST /api/leads]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

