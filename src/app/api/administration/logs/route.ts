import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId")?.trim() || undefined;
    const moduleId = searchParams.get("module")?.trim() || undefined;
    const action = searchParams.get("action")?.trim() || undefined;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "200", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 200;

    const where: {
      userId?: string;
      module?: string;
      action?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};
    if (userId) where.userId = userId;
    if (moduleId) where.module = moduleId;
    if (action) where.action = action;
    if (from || to) {
      where.createdAt = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) where.createdAt.gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) where.createdAt.lte = d;
      }
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        module: true,
        targetId: true,
        details: true,
        ipAddress: true,
        createdAt: true,
        userId: true,
      },
    });

    const userIds = Array.from(new Set(logs.map((log) => log.userId).filter((id): id is string => Boolean(id))));
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, surname: true, fullname: true, login: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    return NextResponse.json(
      logs.map((log) => {
        const user = log.userId ? userMap.get(log.userId) : null;
        return {
          id: log.id,
          action: log.action,
          module: log.module,
          targetId: log.targetId,
          details: log.details,
          ipAddress: log.ipAddress,
          createdAt: log.createdAt,
          user: user
            ? {
                id: user.id,
                login: user.login,
                email: user.email,
                name: user.fullname || `${user.name} ${user.surname}`.trim(),
              }
            : null,
        };
      })
    );
  } catch (error) {
    console.error("[GET /api/administration/logs]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
