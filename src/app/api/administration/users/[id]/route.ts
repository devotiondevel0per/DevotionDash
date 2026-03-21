import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { writeAuditLog, getClientIpAddress } from "@/lib/audit-log";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        login: true,
        email: true,
        name: true,
        surname: true,
        fullname: true,
        position: true,
        department: true,
        company: true,
        location: true,
        photoUrl: true,
        language: true,
        timezone: true,
        isAdmin: true,
        isActive: true,
        workState: true,
        lastActivity: true,
        createdAt: true,
        updatedAt: true,
        groupMembers: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json(user);
  } catch (error) {
    console.error("[GET /api/administration/users/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const body = await req.json();
    const {
      name,
      surname,
      fullname,
      email,
      position,
      department,
      company,
      location,
      language,
      timezone,
      isAdmin,
      isActive,
      workState,
    } = body as {
      name?: string;
      surname?: string;
      fullname?: string;
      email?: string;
      position?: string;
      department?: string;
      company?: string;
      location?: string;
      language?: string;
      timezone?: number;
      isAdmin?: boolean;
      isActive?: boolean;
      workState?: number;
    };

    const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(surname !== undefined && { surname: surname.trim() }),
        ...(fullname !== undefined && { fullname: fullname.trim() }),
        ...(email !== undefined && { email: email.trim() }),
        ...(position !== undefined && { position }),
        ...(department !== undefined && { department }),
        ...(company !== undefined && { company }),
        ...(location !== undefined && { location }),
        ...(language !== undefined && { language }),
        ...(timezone !== undefined && { timezone }),
        ...(isAdmin !== undefined && { isAdmin }),
        ...(isActive !== undefined && { isActive }),
        ...(workState !== undefined && { workState }),
      },
      select: {
        id: true,
        login: true,
        email: true,
        name: true,
        surname: true,
        fullname: true,
        position: true,
        department: true,
        isAdmin: true,
        isActive: true,
        workState: true,
        lastActivity: true,
        updatedAt: true,
      },
    });

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "USER_UPDATED",
      module: "administration",
      targetId: id,
      details: JSON.stringify({
        email: updated.email,
        isAdmin: updated.isAdmin,
        isActive: updated.isActive,
        workState: updated.workState,
      }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PUT /api/administration/users/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
