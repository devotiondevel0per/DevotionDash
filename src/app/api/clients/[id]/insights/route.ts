import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess, type AccessContext } from "@/lib/api-access";
import { generateOrganizationInsights } from "@/lib/ai/organization-insights";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function organizationAccessWhere(id: string, ctx: AccessContext) {
  if (ctx.access.isAdmin) return { id };
  return {
    id,
    OR: [
      { managerId: ctx.userId },
      { contacts: { some: { createdById: ctx.userId } } },
      { leads: { some: { ownerId: ctx.userId } } },
      { serviceDeskRequests: { some: { OR: [{ requesterId: ctx.userId }, { assigneeId: ctx.userId }] } } },
      { chatDialogs: { some: { members: { some: { userId: ctx.userId } } } } },
    ],
  };
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("clients", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const organization = await prisma.organization.findFirst({
      where: organizationAccessWhere(id, accessResult.ctx),
      include: {
        manager: { select: { id: true, name: true, fullname: true } },
        _count: {
          select: {
            contacts: true,
            emails: true,
            chatDialogs: true,
            serviceDeskRequests: true,
            historyEntries: true,
          },
        },
        historyEntries: {
          orderBy: { createdAt: "desc" },
          take: 14,
          select: {
            id: true,
            createdAt: true,
            content: true,
            isSystem: true,
            userId: true,
          },
        },
      },
    });

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const [openRequests, closedRequests, recentEmails] = await Promise.all([
      prisma.serviceDeskRequest.count({ where: { organizationId: id, status: { in: ["open", "pending"] } } }),
      prisma.serviceDeskRequest.count({ where: { organizationId: id, status: "closed" } }),
      prisma.email.count({ where: { organizationId: id, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
    ]);

    const userIds = [...new Set(organization.historyEntries.map((entry) => entry.userId).filter(Boolean))] as string[];
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, fullname: true },
          })
        : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    const insights = await generateOrganizationInsights({
      organization: {
        id: organization.id,
        name: organization.name,
        type: organization.type,
        status: organization.status,
        rating: organization.rating,
        industry: organization.industry,
        leadSource: organization.leadSource,
        managerName: organization.manager ? organization.manager.fullname || organization.manager.name : null,
        createdAt: organization.createdAt.toISOString(),
        updatedAt: organization.updatedAt.toISOString(),
      },
      metrics: {
        contacts: organization._count.contacts,
        emails: organization._count.emails,
        chatDialogs: organization._count.chatDialogs,
        serviceDeskRequests: organization._count.serviceDeskRequests,
        historyEntries: organization._count.historyEntries,
        openServiceDeskRequests: openRequests,
        closedServiceDeskRequests: closedRequests,
        recentEmails30d: recentEmails,
      },
      recentTimeline: organization.historyEntries.map((entry) => {
        const user = entry.userId ? userMap.get(entry.userId) : null;
        return {
          createdAt: entry.createdAt.toISOString(),
          content: entry.content,
          isSystem: entry.isSystem,
          userName: user ? user.fullname || user.name : null,
        };
      }),
    });

    return NextResponse.json(insights);
  } catch (error) {
    console.error("[POST /api/clients/[id]/insights]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
