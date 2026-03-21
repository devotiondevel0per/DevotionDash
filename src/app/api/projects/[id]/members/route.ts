import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectWriteAccess } from "@/lib/project-access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, projectId, {
      managerOnly: true,
    });
    if (!projectAccess.ok) return projectAccess.response;

    const body = await req.json() as { userId?: string; role?: string };
    const { userId, role = "member" } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (role !== "member" && role !== "manager") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "User not found or inactive" }, { status: 400 });
    }

    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: { role },
      create: { projectId, userId, role },
      include: {
        user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
      },
    });

    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projects/[id]/members]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
