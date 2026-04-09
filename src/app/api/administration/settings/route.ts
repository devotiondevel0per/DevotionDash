import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, getClientIpAddress } from "@/lib/audit-log";
import { requireModuleAccess } from "@/lib/api-access";
import { invalidateOllamaModelCache } from "@/lib/ai/model-config";
import {
  TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES_KEY,
  invalidateTaskConversationPolicyCache,
  normalizeTaskConversationAuthorEditWindowMinutes,
} from "@/lib/task-conversation-policy";

export async function GET() {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const settings = await prisma.systemSetting.findMany();
    const obj = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    return NextResponse.json(obj);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { settings } = (await req.json()) as { settings: Record<string, string> };

    const normalizedSettings = Object.fromEntries(
      Object.entries(settings ?? {}).map(([key, value]) => [key, String(value ?? "")])
    );

    await Promise.all(
      Object.entries(normalizedSettings).map(([key, value]) =>
        prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
      )
    );

    if (Object.prototype.hasOwnProperty.call(normalizedSettings, "ai.model")) {
      invalidateOllamaModelCache(normalizedSettings["ai.model"]);
    }
    if (
      Object.prototype.hasOwnProperty.call(
        normalizedSettings,
        TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES_KEY
      )
    ) {
      invalidateTaskConversationPolicyCache(
        normalizeTaskConversationAuthorEditWindowMinutes(
          normalizedSettings[TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES_KEY]
        )
      );
    }

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "SETTINGS_UPDATED",
      module: "administration",
      details: JSON.stringify({ keys: Object.keys(normalizedSettings) }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
