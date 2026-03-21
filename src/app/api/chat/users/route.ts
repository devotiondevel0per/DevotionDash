import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const accessResult = await requireModuleAccess("chat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    // Return all active users — the caller is already authenticated with chat.read access.
    // Every team member is a valid chat contact regardless of individual role configuration.
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: accessResult.ctx.userId },
      },
      select: {
        id: true,
        name: true,
        surname: true,
        fullname: true,
        email: true,
        position: true,
        department: true,
        photoUrl: true,
        workState: true,
        agentStatus: true,
        lastActivity: true,
        groupMembers: {
          include: {
            group: { select: { id: true, name: true, color: true } },
          },
        },
      },
      orderBy: [{ fullname: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(
      users.map((user) => ({
        id: user.id,
        name: user.name,
        fullname: user.fullname || `${user.name} ${user.surname}`.trim(),
        email: user.email,
        position: user.position,
        department: user.department,
        photoUrl: user.photoUrl,
        workState: user.workState,
        agentStatus: user.agentStatus,
        lastActivity: user.lastActivity,
        roles: user.groupMembers.map((m) => ({
          id: m.group.id,
          name: m.group.name,
          color: m.group.color,
        })),
      }))
    );
  } catch (error) {
    console.error("[GET /api/chat/users]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
