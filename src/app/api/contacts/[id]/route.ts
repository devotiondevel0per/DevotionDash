import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess, type AccessContext } from "@/lib/api-access";

type RouteContext = { params: Promise<{ id: string }> };

function clean(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function includeContactRelations() {
  return {
    organization: {
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        rating: true,
        industry: true,
        city: true,
        country: true,
        email: true,
        phone: true,
        website: true,
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
  } as const;
}

function contactAccessWhere(id: string, ctx: AccessContext) {
  if (ctx.access.isAdmin) return { id };
  return {
    id,
    OR: [{ createdById: ctx.userId }, { organization: { is: { managerId: ctx.userId } } }],
  };
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("contacts", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const contact = await prisma.contact.findFirst({
      where: contactAccessWhere(id, accessResult.ctx),
      include: includeContactRelations(),
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const relatedContacts = contact.organizationId
      ? await prisma.contact.findMany({
          where: {
            organizationId: contact.organizationId,
            NOT: { id: contact.id },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            mobile: true,
            phone: true,
            position: true,
            department: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 8,
        })
      : [];

    return NextResponse.json({
      ...contact,
      relatedContacts,
    });
  } catch (error) {
    console.error("[GET /api/contacts/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("contacts", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const existing = await prisma.contact.findFirst({
      where: contactAccessWhere(id, accessResult.ctx),
    });
    if (!existing) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
      firstName,
      lastName,
      email,
      phone,
      mobile,
      position,
      department,
      organizationId,
      note,
      website,
      country,
      city,
      address,
    } = body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      mobile?: string;
      position?: string;
      department?: string;
      organizationId?: string | null;
      note?: string;
      website?: string;
      country?: string;
      city?: string;
      address?: string;
    };

    const data: Record<string, unknown> = {};

    if (firstName !== undefined) {
      const value = clean(firstName);
      if (!value) {
        return NextResponse.json({ error: "firstName is required" }, { status: 400 });
      }
      data.firstName = value;
    }

    if (lastName !== undefined) {
      const value = clean(lastName);
      if (!value) {
        return NextResponse.json({ error: "lastName is required" }, { status: 400 });
      }
      data.lastName = value;
    }

    if (email !== undefined) {
      const value = clean(email);
      if (value && !isValidEmail(value)) {
        return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
      }
      data.email = value;
    }

    if (phone !== undefined) data.phone = clean(phone);
    if (mobile !== undefined) data.mobile = clean(mobile);
    if (position !== undefined) data.position = clean(position);
    if (department !== undefined) data.department = clean(department);
    if (note !== undefined) data.note = clean(note);
    if (website !== undefined) data.website = clean(website);
    if (country !== undefined) data.country = clean(country);
    if (city !== undefined) data.city = clean(city);
    if (address !== undefined) data.address = clean(address);

    if (organizationId !== undefined) {
      if (!organizationId || organizationId === "none") {
        data.organizationId = null;
      } else {
        const org = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { id: true },
        });
        if (!org) {
          return NextResponse.json({ error: "Invalid organizationId" }, { status: 400 });
        }
        data.organizationId = org.id;
      }
    }

    const contact = await prisma.contact.update({
      where: { id },
      data,
      include: includeContactRelations(),
    });

    return NextResponse.json(contact);
  } catch (error) {
    console.error("[PUT /api/contacts/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("contacts", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const contact = await prisma.contact.findFirst({
      where: contactAccessWhere(id, accessResult.ctx),
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    await prisma.contact.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/contacts/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
