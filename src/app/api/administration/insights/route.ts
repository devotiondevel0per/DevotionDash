import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  MODULE_TOGGLES_KEY,
  parseEnabledModulesSetting,
  USER_PERMISSION_OVERRIDE_PREFIX,
} from "@/lib/admin-config";
import { moduleIds } from "@/lib/permissions";
import { getOllamaModel } from "@/lib/ai/model-config";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000);

type AdminInsight = {
  summary: string;
  highlights: string[];
  risks: string[];
  actions: string[];
  generatedAt: string;
  source: string;
  fallback: boolean;
};

function fallbackInsight(
  input: {
    users: number;
    activeUsers: number;
    roles: number;
    moduleCountEnabled: number;
    moduleCountTotal: number;
    overrideUsers: number;
    settingsCount: number;
    logsLast7d: number;
  },
  model: string
): AdminInsight {
  const inactiveUsers = input.users - input.activeUsers;
  const highlights = [
    `${input.activeUsers}/${input.users} users are active.`,
    `${input.roles} roles configured with ${input.overrideUsers} user-level overrides.`,
    `${input.moduleCountEnabled}/${input.moduleCountTotal} modules are enabled globally.`,
  ];
  const risks: string[] = [];
  if (inactiveUsers > 0) risks.push(`${inactiveUsers} users are inactive and may require access review.`);
  if (input.logsLast7d === 0) risks.push("No administration audit activity was recorded in the last 7 days.");
  if (input.settingsCount < 3) risks.push("System settings are lightly configured; review branding and theme defaults.");
  if (risks.length === 0) risks.push("No immediate administration risk detected from current signals.");

  const actions = [
    "Review role mappings and remove redundant broad access.",
    "Verify module toggles match active business processes.",
    "Run a weekly audit log review for governance.",
  ];

  return {
    summary: "Administration baseline is stable. Prioritize access hygiene, module governance, and audit cadence.",
    highlights,
    risks: risks.slice(0, 4),
    actions,
    generatedAt: new Date().toISOString(),
    source: `fallback:${model}`,
    fallback: true,
  };
}

async function callOllama(prompt: string, model: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: { temperature: 0.25 },
        messages: [
          { role: "system", content: "You are an enterprise admin operations assistant. Return JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Ollama failed: ${response.status}`);
    const payload = (await response.json()) as { message?: { content?: string } };
    const content = payload.message?.content?.trim();
    if (!content) throw new Error("Empty response");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickStrings(value: unknown, limit = 4) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

export async function GET() {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const model = await getOllamaModel();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [users, activeUsers, roles, settings, logsLast7d, overrideSettings] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.group.count(),
      prisma.systemSetting.findMany({ select: { key: true, value: true } }),
      prisma.auditLog.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.systemSetting.count({ where: { key: { startsWith: USER_PERMISSION_OVERRIDE_PREFIX } } }),
    ]);

    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));
    const enabledModules = parseEnabledModulesSetting(settingsMap.get(MODULE_TOGGLES_KEY));
    const snapshot = {
      users,
      activeUsers,
      roles,
      settingsCount: settings.length,
      overrideUsers: overrideSettings,
      logsLast7d,
      moduleCountEnabled: enabledModules.length,
      moduleCountTotal: moduleIds.length,
    };

    const prompt = [
      "Analyze this admin control-center snapshot and provide concise governance insight.",
      "Return strict JSON with shape:",
      '{"summary":"string","highlights":["string"],"risks":["string"],"actions":["string"]}',
      "- summary: max 2 short sentences",
      "- highlights/risks/actions max 4 each",
      `Snapshot: ${JSON.stringify(snapshot)}`,
    ].join("\n");

    try {
      const raw = await callOllama(prompt, model);
      const parsed = parseJsonObject(raw);
      if (!parsed) return NextResponse.json(fallbackInsight(snapshot, model));

      const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
      const highlights = pickStrings(parsed.highlights, 4);
      const risks = pickStrings(parsed.risks, 4);
      const actions = pickStrings(parsed.actions, 4);

      if (!summary) return NextResponse.json(fallbackInsight(snapshot, model));

      return NextResponse.json({
        summary,
        highlights,
        risks,
        actions,
        generatedAt: new Date().toISOString(),
        source: `ollama:${model}`,
        fallback: false,
      } satisfies AdminInsight);
    } catch {
      return NextResponse.json(fallbackInsight(snapshot, model));
    }
  } catch (error) {
    console.error("[GET /api/administration/insights]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
