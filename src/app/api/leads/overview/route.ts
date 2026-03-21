import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { toLeadStageLabel } from "@/lib/leads";

async function safeCount<T>(query: Promise<T>, fallback: number) {
  try {
    const value = await query;
    return typeof value === "number" ? value : fallback;
  } catch {
    return fallback;
  }
}

export async function GET() {
  const accessResult = await requireModuleAccess("leads", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;
    const isAdmin = accessResult.ctx.access.isAdmin;

    const leadScope = isAdmin ? {} : { ownerId: userId };
    const organizationScope = isAdmin
      ? {}
      : {
          OR: [
            { managerId: userId },
            { leads: { some: { ownerId: userId } } },
            { contacts: { some: { createdById: userId } } },
            { serviceDeskRequests: { some: { OR: [{ requesterId: userId }, { assigneeId: userId }] } } },
            { chatDialogs: { some: { members: { some: { userId } } } } },
          ],
        };
    const contactScope = isAdmin
      ? {}
      : {
          OR: [
            { createdById: userId },
            { organization: { is: { managerId: userId } } },
          ],
        };

    const [totalLeads, totalOrganizations, totalContacts, openLeads, recentBase] = await Promise.all([
      safeCount(prisma.lead.count({ where: leadScope }), 0),
      safeCount(prisma.organization.count({ where: organizationScope }), 0),
      safeCount(prisma.contact.count({ where: contactScope }), 0),
      safeCount(prisma.lead.count({ where: { ...leadScope, status: "open" } }), 0),
      prisma.lead
        .findMany({
          where: leadScope,
          orderBy: { updatedAt: "desc" },
          take: 6,
          select: {
            id: true,
            title: true,
            companyName: true,
            stage: true,
            source: true,
            updatedAt: true,
            ownerId: true,
          },
        })
        .catch(() => []),
    ]);

    const ownerIds = Array.from(new Set(recentBase.map((item) => item.ownerId).filter(Boolean))) as string[];
    const owners = ownerIds.length
      ? await prisma.user
          .findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, fullname: true, name: true, surname: true },
          })
          .catch(() => [])
      : [];
    const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));

    return NextResponse.json({
      totals: {
        totalLeads,
        organizations: totalOrganizations,
        contacts: totalContacts,
        openFollowUps: openLeads,
      },
      recentPipeline: recentBase.map((item) => {
        const owner = item.ownerId ? ownerMap.get(item.ownerId) : null;
        return {
        id: item.id,
        name: item.title || item.companyName,
        stage: toLeadStageLabel(item.stage),
        type: item.source || "direct",
        owner: owner?.fullname || [owner?.name, owner?.surname].filter(Boolean).join(" ").trim() || "Unassigned",
        updatedAt: item.updatedAt.toISOString(),
      };
      }),
    });
  } catch (error) {
    console.error("[GET /api/leads/overview]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
