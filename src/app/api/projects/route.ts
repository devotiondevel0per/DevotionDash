import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { canListAllProjects } from "@/lib/project-access";

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("projects", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

    const where: Record<string, unknown> = {};

    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;
    if (search) where.name = { contains: search };
    if (!canListAllProjects(accessResult.ctx)) {
      where.members = { some: { userId } };
    }

    const projects = await prisma.project.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        members: {
          include: {
            user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
          },
        },
        tasks: {
          select: { status: true },
        },
        _count: {
          select: { phases: true, tasks: true },
        },
      },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error("[GET /api/projects]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const { name, description, categoryId, startDate, endDate } = body as {
      name: string;
      description?: string;
      categoryId?: string;
      startDate?: string;
      endDate?: string;
    };

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const userId = accessResult.ctx.userId;

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description,
        categoryId: categoryId ?? null,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        members: {
          create: {
            userId,
            role: "manager",
          },
        },
      },
      include: {
        category: true,
        members: {
          include: {
            user: { select: { id: true, name: true, fullname: true, photoUrl: true } },
          },
        },
        tasks: {
          select: { status: true },
        },
        _count: {
          select: { phases: true, tasks: true },
        },
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projects]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
