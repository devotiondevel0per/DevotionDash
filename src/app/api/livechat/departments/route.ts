import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const accessResult = await requireModuleAccess("livechat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const departments = await prisma.liveChatDepartment.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true, name: true, fullname: true, photoUrl: true,
                agentStatus: true, lastActivity: true, isActive: true,
              },
            },
          },
        },
        _count: {
          select: {
            dialogs: { where: { isExternal: true, status: "open" } },
          },
        },
      },
    });

    return NextResponse.json(
      departments.map((dept) => ({
        id: dept.id,
        name: dept.name,
        description: dept.description,
        sortOrder: dept.sortOrder,
        openDialogCount: dept._count.dialogs,
        members: dept.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          isLead: m.isLead,
          user: {
            id: m.user.id,
            name: m.user.name,
            fullname: m.user.fullname,
            photoUrl: m.user.photoUrl,
            agentStatus: m.user.agentStatus,
            lastActivity: m.user.lastActivity,
            isActive: m.user.isActive,
          },
        })),
      }))
    );
  } catch (error) {
    console.error("[GET /api/livechat/departments]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("livechat", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      memberIds?: Array<{ userId: string; isLead?: boolean }>;
    };

    const name = body.name?.trim() ?? "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const dept = await prisma.liveChatDepartment.create({
      data: {
        name,
        description: body.description?.trim() ?? null,
        members: body.memberIds?.length
          ? {
              create: body.memberIds.map((m) => ({
                userId: m.userId,
                isLead: m.isLead ?? false,
              })),
            }
          : undefined,
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, fullname: true, photoUrl: true, agentStatus: true } },
          },
        },
      },
    });

    return NextResponse.json(dept, { status: 201 });
  } catch (error) {
    console.error("[POST /api/livechat/departments]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
