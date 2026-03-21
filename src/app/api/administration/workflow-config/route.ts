import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { writeAuditLog } from "@/lib/audit-log";
import {
  DEFAULT_PROJECT_TASK_STAGES,
  DEFAULT_SERVICEDESK_STAGES,
  DEFAULT_TASK_STAGES,
  PROJECT_TASK_STAGES_KEY,
  SERVICEDESK_STAGES_KEY,
  TASK_STAGES_KEY,
  loadProjectTaskStages,
  loadServiceDeskStages,
  loadTaskStages,
  sanitizeStages,
  saveStages,
} from "@/lib/workflow-config";
import { headers } from "next/headers";

export async function GET() {
  const access = await requireModuleAccess("administration", "read");
  if (!access.ok) return access.response;

  const [tasks, servicedesk, projectTasks] = await Promise.all([
    loadTaskStages(),
    loadServiceDeskStages(),
    loadProjectTaskStages(),
  ]);

  return NextResponse.json({ tasks, servicedesk, projectTasks });
}

export async function PUT(req: Request) {
  const access = await requireModuleAccess("administration", "manage");
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => ({}));
  const ip = (await headers()).get("x-forwarded-for") ?? undefined;

  const results: Record<string, unknown> = {};

  if (body.tasks !== undefined) {
    const stages = sanitizeStages(body.tasks, DEFAULT_TASK_STAGES);
    await saveStages(TASK_STAGES_KEY, stages);
    results.tasks = stages;
  }

  if (body.servicedesk !== undefined) {
    const stages = sanitizeStages(body.servicedesk, DEFAULT_SERVICEDESK_STAGES);
    await saveStages(SERVICEDESK_STAGES_KEY, stages);
    results.servicedesk = stages;
  }

  if (body.projectTasks !== undefined) {
    const stages = sanitizeStages(body.projectTasks, DEFAULT_PROJECT_TASK_STAGES);
    await saveStages(PROJECT_TASK_STAGES_KEY, stages);
    results.projectTasks = stages;
  }

  await writeAuditLog({
    userId: access.ctx.userId,
    action: "WORKFLOW_CONFIG_UPDATED",
    module: "administration",
    details: JSON.stringify({ updated: Object.keys(results) }),
    ipAddress: ip,
  });

  return NextResponse.json({ success: true, ...results });
}
