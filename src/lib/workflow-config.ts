import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

// ─────────────────────────────────────────────
// SETTING KEYS
// ─────────────────────────────────────────────

export const TASK_STAGES_KEY = "workflow.tasks.stages";
export const SERVICEDESK_STAGES_KEY = "workflow.servicedesk.stages";
export const PROJECT_TASK_STAGES_KEY = "workflow.project_tasks.stages";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface WorkflowStage {
  key: string;        // internal key, e.g. "opened"
  label: string;      // display label, e.g. "Open"
  color: string;      // hex color, e.g. "#22c55e"
  isClosed: boolean;  // marks the task/request as done
  isDefault: boolean; // the default stage for new items
  order: number;
}

// ─────────────────────────────────────────────
// DEFAULTS
// ─────────────────────────────────────────────

export const DEFAULT_TASK_STAGES: WorkflowStage[] = [
  { key: "opened",    label: "Open",      color: "#22c55e", isClosed: false, isDefault: true,  order: 0 },
  { key: "completed", label: "Completed", color: "#3b82f6", isClosed: true,  isDefault: false, order: 1 },
  { key: "closed",    label: "Closed",    color: "#64748b", isClosed: true,  isDefault: false, order: 2 },
];

export const DEFAULT_SERVICEDESK_STAGES: WorkflowStage[] = [
  { key: "open",    label: "Open",    color: "#22c55e", isClosed: false, isDefault: true,  order: 0 },
  { key: "pending", label: "Pending", color: "#f59e0b", isClosed: false, isDefault: false, order: 1 },
  { key: "closed",  label: "Closed",  color: "#64748b", isClosed: true,  isDefault: false, order: 2 },
];

export const DEFAULT_PROJECT_TASK_STAGES: WorkflowStage[] = [
  { key: "todo",        label: "To Do",       color: "#64748b", isClosed: false, isDefault: true,  order: 0 },
  { key: "in_progress", label: "In Progress", color: "#3b82f6", isClosed: false, isDefault: false, order: 1 },
  { key: "done",        label: "Done",        color: "#22c55e", isClosed: true,  isDefault: false, order: 2 },
  { key: "cancelled",   label: "Cancelled",   color: "#ef4444", isClosed: true,  isDefault: false, order: 3 },
];

// ─────────────────────────────────────────────
// SANITIZE
// ─────────────────────────────────────────────

export function sanitizeStages(input: unknown, defaults: WorkflowStage[]): WorkflowStage[] {
  if (!Array.isArray(input) || input.length === 0) return defaults;

  const stages: WorkflowStage[] = [];
  let hasDefault = false;

  for (let i = 0; i < input.length; i++) {
    const s = input[i];
    if (!s || typeof s !== "object") continue;
    const key = String(s.key ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");
    if (!key) continue;
    const label = String(s.label ?? key).trim().slice(0, 64) || key;
    const color = /^#[0-9a-fA-F]{6}$/.test(String(s.color ?? "")) ? String(s.color) : "#64748b";
    const isClosed = Boolean(s.isClosed);
    const isDefault = Boolean(s.isDefault);
    if (isDefault) hasDefault = true;
    stages.push({ key, label, color, isClosed, isDefault, order: i });
  }

  if (stages.length === 0) return defaults;
  if (!hasDefault) stages[0].isDefault = true;
  return stages;
}

// ─────────────────────────────────────────────
// LOADERS
// ─────────────────────────────────────────────

async function loadStages(
  key: string,
  defaults: WorkflowStage[],
  db?: PrismaClient
): Promise<WorkflowStage[]> {
  const actualDb = db ?? prisma;
  try {
    const row = await actualDb.systemSetting.findUnique({ where: { key } });
    if (!row?.value) return defaults;
    const parsed = JSON.parse(row.value);
    return sanitizeStages(parsed, defaults);
  } catch {
    return defaults;
  }
}

export function loadTaskStages(db?: PrismaClient): Promise<WorkflowStage[]> {
  return loadStages(TASK_STAGES_KEY, DEFAULT_TASK_STAGES, db);
}

export function loadServiceDeskStages(db?: PrismaClient): Promise<WorkflowStage[]> {
  return loadStages(SERVICEDESK_STAGES_KEY, DEFAULT_SERVICEDESK_STAGES, db);
}

export function loadProjectTaskStages(db?: PrismaClient): Promise<WorkflowStage[]> {
  return loadStages(PROJECT_TASK_STAGES_KEY, DEFAULT_PROJECT_TASK_STAGES, db);
}

// ─────────────────────────────────────────────
// SAVE
// ─────────────────────────────────────────────

export async function saveStages(
  key: string,
  stages: WorkflowStage[],
  db?: PrismaClient
): Promise<void> {
  const actualDb = db ?? prisma;
  await actualDb.systemSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(stages) },
    update: { value: JSON.stringify(stages) },
  });
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

export function getDefaultStage(stages: WorkflowStage[]): WorkflowStage {
  return stages.find((s) => s.isDefault) ?? stages[0];
}

export function isClosedStage(stages: WorkflowStage[], key: string): boolean {
  return stages.find((s) => s.key === key)?.isClosed ?? false;
}
