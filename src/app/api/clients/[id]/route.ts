import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess, type AccessContext } from "@/lib/api-access";

type RouteContext = { params: Promise<{ id: string }> };

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

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("clients", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const organization = await prisma.organization.findFirst({
      where: organizationAccessWhere(id, accessResult.ctx),
      include: {
        manager: { select: { id: true, name: true, fullname: true } },
        sla: { select: { id: true, name: true, hoursLimit: true } },
        contacts: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            position: true,
          },
          orderBy: { createdAt: "asc" },
        },
        historyEntries: {
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            id: true,
            content: true,
            isSystem: true,
            createdAt: true,
            userId: true,
          },
        },
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

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json(organization);
  } catch (error) {
    console.error("[GET /api/clients/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("clients", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const existing = await prisma.organization.findFirst({
      where: organizationAccessWhere(id, accessResult.ctx),
    });
    if (!existing) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

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
      name?: string;
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

    if (managerId !== undefined) {
      if (
        !accessResult.ctx.access.isAdmin &&
        managerId !== null &&
        managerId !== accessResult.ctx.userId
      ) {
        return NextResponse.json(
          { error: "Forbidden: you can only assign organization manager to yourself" },
          { status: 403 }
        );
      }
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

    // Collect changed field descriptions for history
    const changes: string[] = [];
    if (name !== undefined && name !== existing.name) changes.push(`Name changed to "${name}"`);
    if (status !== undefined && status !== existing.status) changes.push(`Status changed to "${status}"`);
    if (type !== undefined && type !== existing.type) changes.push(`Type changed to "${type}"`);
    if (rating !== undefined && rating !== existing.rating) changes.push(`Rating changed to "${rating}"`);
    if (managerId !== undefined && managerId !== existing.managerId) changes.push("Manager updated");
    if (slaId !== undefined && slaId !== existing.slaId) changes.push("SLA updated");

    const organization = await prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(type !== undefined && { type }),
          ...(status !== undefined && { status }),
          ...(rating !== undefined && { rating }),
          ...(industry !== undefined && { industry }),
          ...(leadSource !== undefined && { leadSource }),
          ...(managerId !== undefined && { managerId }),
          ...(email !== undefined && { email }),
          ...(website !== undefined && { website }),
          ...(phone !== undefined && { phone }),
          ...(fax !== undefined && { fax }),
          ...(country !== undefined && { country }),
          ...(city !== undefined && { city }),
          ...(address !== undefined && { address }),
          ...(comment !== undefined && { comment }),
          ...(slaId !== undefined && { slaId }),
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

      if (changes.length > 0) {
        await tx.orgHistory.create({
          data: {
            organizationId: id,
            userId: accessResult.ctx.userId,
            content: changes.join("; "),
            isSystem: true,
          },
        });
      }

      return updated;
    });

    return NextResponse.json(organization);
  } catch (error) {
    console.error("[PUT /api/clients/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("clients", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const existing = await prisma.organization.findFirst({
      where: organizationAccessWhere(id, accessResult.ctx),
    });
    if (!existing) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id },
        data: { status: "closed" },
      });

      await tx.orgHistory.create({
        data: {
          organizationId: id,
          userId: accessResult.ctx.userId,
          content: "Organization closed",
          isSystem: true,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/clients/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
