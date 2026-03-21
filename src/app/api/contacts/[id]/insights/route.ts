import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess, type AccessContext } from "@/lib/api-access";
import { generateContactInsights } from "@/lib/ai/contact-insights";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function displayName(user: { name: string; fullname: string } | null) {
  if (!user) return null;
  return user.fullname || user.name;
}

function contactAccessWhere(id: string, ctx: AccessContext) {
  if (ctx.access.isAdmin) return { id };
  return {
    id,
    OR: [{ createdById: ctx.userId }, { organization: { is: { managerId: ctx.userId } } }],
  };
}

function profileCompleteness(contact: {
  email: string | null;
  phone: string | null;
  mobile: string | null;
  position: string | null;
  department: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  note: string | null;
  website: string | null;
}) {
  const slots = [
    contact.email,
    contact.phone,
    contact.mobile,
    contact.position,
    contact.department,
    contact.city,
    contact.country,
    contact.address,
    contact.note,
    contact.website,
  ];

  const filled = slots.filter((value) => typeof value === "string" && value.trim()).length;
  return Math.round((filled / slots.length) * 100);
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("contacts", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const contact = await prisma.contact.findFirst({
      where: contactAccessWhere(id, accessResult.ctx),
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            rating: true,
            industry: true,
            manager: { select: { id: true, name: true, fullname: true } },
            _count: {
              select: {
                contacts: true,
                emails: true,
                serviceDeskRequests: true,
                historyEntries: true,
              },
            },
          },
        },
        createdBy: { select: { id: true, name: true, fullname: true } },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const email = contact.email?.trim() || null;
    const now = Date.now();
    const last30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [emailsFromContactTotal, emailsFromContact30d, openRequests, closedRequests, orgRecentTimeline] = await Promise.all([
      email
        ? prisma.email.count({
            where: { senderEmail: email },
          })
        : Promise.resolve(0),
      email
        ? prisma.email.count({
            where: {
              senderEmail: email,
              createdAt: { gte: last30d },
            },
          })
        : Promise.resolve(0),
      contact.organizationId
        ? prisma.serviceDeskRequest.count({
            where: {
              organizationId: contact.organizationId,
              status: { in: ["open", "pending"] },
            },
          })
        : Promise.resolve(0),
      contact.organizationId
        ? prisma.serviceDeskRequest.count({
            where: {
              organizationId: contact.organizationId,
              status: "closed",
            },
          })
        : Promise.resolve(0),
      contact.organizationId
        ? prisma.orgHistory.findMany({
            where: {
              organizationId: contact.organizationId,
              createdAt: { gte: last30d },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { id: true, createdAt: true },
          })
        : Promise.resolve([]),
    ]);

    const insights = await generateContactInsights({
      contact: {
        id: contact.id,
        fullName: `${contact.firstName} ${contact.lastName}`.trim(),
        email: contact.email,
        phone: contact.phone,
        mobile: contact.mobile,
        position: contact.position,
        department: contact.department,
        city: contact.city,
        country: contact.country,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
        ownerName: displayName(contact.createdBy),
      },
      organization: contact.organization
        ? {
            id: contact.organization.id,
            name: contact.organization.name,
            type: contact.organization.type,
            status: contact.organization.status,
            rating: contact.organization.rating,
            industry: contact.organization.industry,
            managerName: displayName(contact.organization.manager),
            contactsCount: contact.organization._count.contacts,
          }
        : null,
      metrics: {
        emailsFromContactTotal,
        emailsFromContact30d,
        openServiceDeskRequests: openRequests,
        closedServiceDeskRequests: closedRequests,
        orgTimelineEntries30d: orgRecentTimeline.length,
        profileCompleteness: profileCompleteness(contact),
      },
    });

    return NextResponse.json(insights);
  } catch (error) {
    console.error("[POST /api/contacts/[id]/insights]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
