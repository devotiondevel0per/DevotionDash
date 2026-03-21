import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import type { Prisma } from "@prisma/client";

function parseBool(value: string | null) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return null;
}

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
        city: true,
        country: true,
        manager: { select: { id: true, name: true, fullname: true } },
        _count: { select: { contacts: true } },
      },
    },
    createdBy: { select: { id: true, name: true, fullname: true } },
  } as const;
}

function buildContactScope(
  access: { isAdmin: boolean },
  userId: string
): Prisma.ContactWhereInput {
  if (access.isAdmin) return {};
  return {
    OR: [{ createdById: userId }, { organization: { is: { managerId: userId } } }],
  };
}

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("contacts", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort");
    const mineOnly = parseBool(searchParams.get("mineOnly")) === true;
    const hasEmail = parseBool(searchParams.get("hasEmail"));
    const hasPhone = parseBool(searchParams.get("hasPhone"));
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "80", 10), 1),
      500
    );

    const where: Prisma.ContactWhereInput = {};
    const and: Prisma.ContactWhereInput[] = [
      buildContactScope(accessResult.ctx.access, accessResult.ctx.userId),
    ];

    if (organizationId && organizationId !== "all") {
      where.organizationId = organizationId === "none" ? null : organizationId;
    }
    if (mineOnly) {
      and.push({ createdById: accessResult.ctx.userId });
    }

    if (hasEmail === true) {
      and.push({
        NOT: {
          OR: [{ email: null }, { email: "" }],
        },
      });
    } else if (hasEmail === false) {
      and.push({
        OR: [{ email: null }, { email: "" }],
      });
    }

    if (hasPhone === true) {
      and.push({
        OR: [
          {
            NOT: {
              OR: [{ mobile: null }, { mobile: "" }],
            },
          },
          {
            NOT: {
              OR: [{ phone: null }, { phone: "" }],
            },
          },
        ],
      });
    } else if (hasPhone === false) {
      and.push({
        AND: [
          {
            OR: [{ mobile: null }, { mobile: "" }],
          },
          {
            OR: [{ phone: null }, { phone: "" }],
          },
        ],
      });
    }

    if (search) {
      and.push({
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
          { position: { contains: search } },
          { department: { contains: search } },
          { city: { contains: search } },
          { country: { contains: search } },
          { organization: { name: { contains: search } } },
        ],
      });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    const orderBy =
      sort === "name"
        ? [{ firstName: "asc" as const }, { lastName: "asc" as const }]
        : sort === "created"
          ? [{ createdAt: "desc" as const }]
          : [{ updatedAt: "desc" as const }];

    const contacts = await prisma.contact.findMany({
      where,
      take: limit,
      orderBy,
      include: includeContactRelations(),
    });

    return NextResponse.json(contacts);
  } catch (error) {
    console.error("[GET /api/contacts]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("contacts", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
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
      firstName: string;
      lastName: string;
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

    const firstNameValue = clean(firstName);
    const lastNameValue = clean(lastName);
    const emailValue = clean(email);

    if (!firstNameValue) {
      return NextResponse.json({ error: "firstName is required" }, { status: 400 });
    }
    if (!lastNameValue) {
      return NextResponse.json({ error: "lastName is required" }, { status: 400 });
    }
    if (emailValue && !isValidEmail(emailValue)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    let organizationRef: string | null = null;
    if (organizationId && organizationId !== "none") {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!org) {
        return NextResponse.json(
          { error: "Invalid organizationId" },
          { status: 400 }
        );
      }
      organizationRef = org.id;
    }

    const contact = await prisma.contact.create({
      data: {
        firstName: firstNameValue,
        lastName: lastNameValue,
        email: emailValue,
        phone: clean(phone),
        mobile: clean(mobile),
        position: clean(position),
        department: clean(department),
        organizationId: organizationRef,
        note: clean(note),
        website: clean(website),
        country: clean(country),
        city: clean(city),
        address: clean(address),
        createdById: accessResult.ctx.userId,
      },
      include: includeContactRelations(),
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("[POST /api/contacts]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
