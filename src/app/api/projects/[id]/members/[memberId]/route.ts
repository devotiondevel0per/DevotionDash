import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectWriteAccess } from "@/lib/project-access";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId, memberId } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, projectId, {
      managerOnly: true,
    });
    if (!projectAccess.ok) return projectAccess.response;

    const member = await prisma.projectMember.findFirst({
      where: { id: memberId, projectId },
      select: { id: true, role: true },
    });
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (member.role === "manager") {
      const managerCount = await prisma.projectMember.count({
        where: { projectId, role: "manager" },
      });
      if (managerCount <= 1) {
        return NextResponse.json(
          { error: "Project must have at least one manager" },
          { status: 400 }
        );
      }
    }

    await prisma.projectMember.delete({ where: { id: memberId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/projects/[id]/members/[memberId]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
