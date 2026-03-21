import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { buildUserAccess } from "@/lib/rbac";
import { moduleIds, type ModuleId, type PermissionAction } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestedModule = searchParams.get("module");
  const guardModule: ModuleId =
    requestedModule && moduleIds.includes(requestedModule as ModuleId)
      ? (requestedModule as ModuleId)
      : "team";

  const accessResult = await requireModuleAccess(guardModule, "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const search = searchParams.get("search");
    const isActiveParam = searchParams.get("isActive");
    const moduleParam = searchParams.get("module");
    const actionParam = searchParams.get("action");
    const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "200", 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 500)
      : 200;

    const moduleFilter: ModuleId | null = moduleIds.includes(moduleParam as ModuleId)
      ? (moduleParam as ModuleId)
      : null;
    const actionFilter: PermissionAction =
      actionParam === "write" || actionParam === "manage" || actionParam === "read"
        ? actionParam
        : "read";

    const where: Record<string, unknown> = {};
    if (isActiveParam === "true") where.isActive = true;
    if (isActiveParam === "false") where.isActive = false;
    if (search) {
      where.OR = [
        { fullname: { contains: search } },
        { name: { contains: search } },
        { surname: { contains: search } },
        { email: { contains: search } },
        { login: { contains: search } },
        { position: { contains: search } },
        { department: { contains: search } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      take: limit,
      select: {
        id: true,
        login: true,
        email: true,
        name: true,
        surname: true,
        fullname: true,
        position: true,
        department: true,
        phoneWork: true,
        phoneMobile: true,
        photoUrl: true,
        workState: true,
        isActive: true,
        lastActivity: true,
        dateBirthday: true,
        createdAt: true,
        agentStatus: true,
      },
    });

    if (!moduleFilter) {
      return NextResponse.json(users);
    }

    const filtered = await Promise.all(
      users.map(async (user) => {
        const access = await buildUserAccess(user.id);
        if (!access?.permissions[moduleFilter]?.[actionFilter]) return null;
        return user;
      })
    );

    const visibleUsers = filtered.filter(
      (user): user is (typeof users)[number] => Boolean(user)
    );

    return NextResponse.json(visibleUsers);
  } catch (error) {
    console.error("[GET /api/team/users]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
