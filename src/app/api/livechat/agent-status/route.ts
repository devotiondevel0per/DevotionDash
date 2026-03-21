import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

const VALID_STATUSES = new Set(["online", "away", "offline"]);

// GET /api/livechat/agent-status — list all agents with their status
export async function GET() {
  const accessResult = await requireModuleAccess("livechat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const agents = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        fullname: true,
        photoUrl: true,
        agentStatus: true,
        lastActivity: true,
        department: true,
        position: true,
      },
      orderBy: { fullname: "asc" },
    });

    // Load open dialog counts for each agent
    const openLoads = await prisma.chatDialogMember.groupBy({
      by: ["userId"],
      where: {
        dialog: { isExternal: true, status: "open" },
      },
      _count: { userId: true },
    });

    const loadMap = new Map(openLoads.map((entry) => [entry.userId, entry._count.userId]));

    return NextResponse.json(
      agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        fullname: agent.fullname,
        photoUrl: agent.photoUrl,
        agentStatus: agent.agentStatus,
        lastActivity: agent.lastActivity,
        department: agent.department,
        position: agent.position,
        openLoad: loadMap.get(agent.id) ?? 0,
      }))
    );
  } catch (error) {
    console.error("[GET /api/livechat/agent-status]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/livechat/agent-status — update own agent status
export async function PUT(req: NextRequest) {
  const accessResult = await requireModuleAccess("livechat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as { status?: string };
    const status = body.status?.toLowerCase().trim() ?? "";

    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status. Must be: online, away, offline" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: accessResult.ctx.userId },
      data: { agentStatus: status, lastActivity: new Date() },
    });

    return NextResponse.json({ success: true, agentStatus: status });
  } catch (error) {
    console.error("[PUT /api/livechat/agent-status]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
