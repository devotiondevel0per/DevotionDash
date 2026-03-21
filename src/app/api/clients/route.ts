import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

function buildOrganizationScope(
  access: { isAdmin: boolean },
  userId: string
): Prisma.OrganizationWhereInput {
  if (access.isAdmin) return {};
  return {
    OR: [
      { managerId: userId },
      { contacts: { some: { createdById: userId } } },
      { leads: { some: { ownerId: userId } } },
      { serviceDeskRequests: { some: { OR: [{ requesterId: userId }, { assigneeId: userId }] } } },
      { chatDialogs: { some: { members: { some: { userId } } } } },
    ],
  };
}

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("clients", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const rating = searchParams.get("rating");
    const managerId = searchParams.get("managerId");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort");
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "80", 10), 1),
      500
    );

    const and: Prisma.OrganizationWhereInput[] = [
      buildOrganizationScope(accessResult.ctx.access, accessResult.ctx.userId),
    ];

    if (status && status !== "all") and.push({ status });
    if (type && type !== "all") and.push({ type });
    if (rating && rating !== "all") and.push({ rating });
    if (managerId && managerId !== "all") {
      and.push({
        managerId: managerId === "me" ? accessResult.ctx.userId : managerId,
      });
    }
    if (search) {
      and.push({
        OR: [
          { name: { contains: search } },
          { email: { contains: search } },
          { website: { contains: search } },
          { city: { contains: search } },
          { country: { contains: search } },
          { industry: { contains: search } },
          { leadSource: { contains: search } },
          { comment: { contains: search } },
        ],
      });
    }

    const where: Prisma.OrganizationWhereInput = and.length > 0 ? { AND: and } : {};

    const orderBy =
      sort === "name"
        ? [{ name: "asc" as const }]
        : sort === "created"
          ? [{ createdAt: "desc" as const }]
          : sort === "rating"
            ? [{ rating: "asc" as const }, { updatedAt: "desc" as const }]
            : [{ updatedAt: "desc" as const }];

    const organizations = await prisma.organization.findMany({
      where,
      take: limit,
      orderBy,
      include: {
        manager: { select: { id: true, name: true, fullname: true } },
        sla: { select: { id: true, name: true, hoursLimit: true } },
        _count: {
          select: {
            contacts: true,
            emails: true,
            chatDialogs: true,
            serviceDeskRequests: true,
            historyEntries: true,
          },
        },
      },
    });

    return NextResponse.json(organizations);
  } catch (error) {
    console.error("[GET /api/clients]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("clients", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const {
      name,
      type,
      status,
      rating,
      industry,
      leadSource,
      managerId,
      email,
      website,
      phone,
      fax,
      country,
      city,
      address,
      comment,
      slaId,
    } = body as {
      name: string;
      type?: string;
      status?: string;
      rating?: string;
      industry?: string;
      leadSource?: string;
      managerId?: string | null;
      email?: string;
      website?: string;
      phone?: string;
      fax?: string;
      country?: string;
      city?: string;
      address?: string;
      comment?: string;
      slaId?: string | null;
    };

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (
      !accessResult.ctx.access.isAdmin &&
      managerId &&
      managerId !== accessResult.ctx.userId
    ) {
      return NextResponse.json(
        { error: "Forbidden: you can only assign organization manager to yourself" },
        { status: 403 }
      );
    }

    if (managerId) {
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
        select: { id: true },
      });
      if (!manager) {
        return NextResponse.json({ error: "Invalid managerId" }, { status: 400 });
      }
    }
    if (slaId) {
      const sla = await prisma.sLA.findUnique({
        where: { id: slaId },
        select: { id: true },
      });
      if (!sla) {
        return NextResponse.json({ error: "Invalid slaId" }, { status: 400 });
      }
    }

    const organization = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: name.trim(),
          type: type ?? "potential",
          status: status ?? "open",
          rating: rating ?? "weak",
          industry,
          leadSource,
          managerId: managerId ?? accessResult.ctx.userId,
          email,
          website,
          phone,
          fax,
          country,
          city,
          address,
          comment,
          slaId: slaId ?? null,
        },
        include: {
          manager: { select: { id: true, name: true, fullname: true } },
          sla: { select: { id: true, name: true, hoursLimit: true } },
          _count: {
            select: {
              contacts: true,
              emails: true,
              chatDialogs: true,
              serviceDeskRequests: true,
              historyEntries: true,
            },
          },
        },
      });

      await tx.orgHistory.create({
        data: {
          organizationId: org.id,
          userId: accessResult.ctx.userId,
          content: "Organization created",
          isSystem: true,
        },
      });

      return org;
    });

    return NextResponse.json(organization, { status: 201 });
  } catch (error) {
    console.error("[POST /api/clients]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
