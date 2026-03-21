import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("livechat", "manage");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    isActive?: boolean;
    sortOrder?: number;
    memberIds?: Array<{ userId: string; isLead?: boolean }>;
  };

  try {
    const existing = await prisma.liveChatDepartment.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.description !== undefined) updateData.description = body.description.trim() || null;
    if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);
    if (body.sortOrder !== undefined) updateData.sortOrder = Number(body.sortOrder) || 0;

    const dept = await prisma.$transaction(async (tx) => {
      const updated = await tx.liveChatDepartment.update({
        where: { id },
        data: updateData,
      });

      if (body.memberIds !== undefined) {
        await tx.liveChatDepartmentMember.deleteMany({ where: { departmentId: id } });
        if (body.memberIds.length > 0) {
          await tx.liveChatDepartmentMember.createMany({
            data: body.memberIds.map((m) => ({
              departmentId: id,
              userId: m.userId,
              isLead: m.isLead ?? false,
            })),
            skipDuplicates: true,
          });
        }
      }

      return updated;
    });

    return NextResponse.json(dept);
  } catch (error) {
    console.error("[PUT /api/livechat/departments/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("livechat", "manage");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  try {
    await prisma.liveChatDepartment.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/livechat/departments/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
