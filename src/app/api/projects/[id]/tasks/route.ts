import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { requireProjectReadAccess, requireProjectWriteAccess } from "@/lib/project-access";
import { loadProjectTaskStages, getDefaultStage } from "@/lib/workflow-config";

const VALID_TASK_PRIORITIES = new Set(["low", "normal", "high"]);

function normalizeTaskStatus(stages: { key: string }[], value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace("-", "_");
  if (!normalized) return undefined;
  return stages.some((s) => s.key === normalized) ? normalized : undefined;
}

function normalizeTaskPriority(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return VALID_TASK_PRIORITIES.has(normalized) ? normalized : undefined;
}

function normalizeOptionalId(value?: string | null): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (["none", "null", "unassigned"].includes(normalized.toLowerCase())) return null;
  return normalized;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId } = await params;
    const projectAccess = await requireProjectReadAccess(accessResult.ctx, projectId);
    if (!projectAccess.ok) return projectAccess.response;

    const stages = await loadProjectTaskStages();
    const { searchParams } = new URL(req.url);
    const phaseId = searchParams.get("phaseId");
    const status = normalizeTaskStatus(stages, searchParams.get("status"));
    const assigneeId = searchParams.get("assigneeId");

    const where: Record<string, unknown> = { projectId };

    if (phaseId) where.phaseId = phaseId;
    if (status) where.status = status;
    if (assigneeId) where.assigneeId = assigneeId;

    const tasks = await prisma.projectTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        assignee: { select: { id: true, name: true, fullname: true, photoUrl: true } },
        phase: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ items: tasks, stages });
  } catch (error) {
    console.error("[GET /api/projects/[id]/tasks]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id: projectId } = await params;
    const projectAccess = await requireProjectWriteAccess(accessResult.ctx, projectId);
    if (!projectAccess.ok) return projectAccess.response;

    const body = await req.json();
    const { title, description, phaseId, assigneeId, status, priority, dueDate } =
      body as {
        title: string;
        description?: string;
        phaseId?: string;
        assigneeId?: string;
        status?: string;
        priority?: string;
        dueDate?: string;
      };

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const ptStages = await loadProjectTaskStages();
    const defaultPtStage = getDefaultStage(ptStages);

    const normalizedAssigneeId = normalizeOptionalId(assigneeId);
    const normalizedPhaseId = normalizeOptionalId(phaseId);
    const normalizedStatus = normalizeTaskStatus(ptStages, status) ?? defaultPtStage.key;
    const normalizedPriority = normalizeTaskPriority(priority) ?? "normal";

    if (assigneeId !== undefined && normalizedAssigneeId === undefined) {
      return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
    }

    if (phaseId !== undefined && normalizedPhaseId === undefined) {
      return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    }

    if (status !== undefined && !normalizeTaskStatus(ptStages, status)) {
      return NextResponse.json({ error: "Invalid task status" }, { status: 400 });
    }

    if (priority !== undefined && !normalizeTaskPriority(priority)) {
      return NextResponse.json({ error: "Invalid task priority" }, { status: 400 });
    }

    if (normalizedAssigneeId) {
      const assigneeMembership = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: normalizedAssigneeId } },
        select: { id: true },
      });
      if (!assigneeMembership) {
        return NextResponse.json(
          { error: "Assignee must be a project member" },
          { status: 400 }
        );
      }
    }

    if (normalizedPhaseId) {
      const phase = await prisma.projectPhase.findFirst({
        where: { id: normalizedPhaseId, projectId },
        select: { id: true },
      });
      if (!phase) {
        return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
      }
    }

    const parsedDueDate = dueDate ? new Date(dueDate) : undefined;
    if (parsedDueDate && Number.isNaN(parsedDueDate.getTime())) {
      return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
    }

    const task = await prisma.projectTask.create({
      data: {
        projectId,
        title: title.trim(),
        description,
        phaseId: normalizedPhaseId ?? null,
        assigneeId: normalizedAssigneeId ?? null,
        status: normalizedStatus,
        priority: normalizedPriority,
        dueDate: parsedDueDate,
      },
      include: {
        assignee: { select: { id: true, name: true, fullname: true, photoUrl: true } },
        phase: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projects/[id]/tasks]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
