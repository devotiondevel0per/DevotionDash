import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireModuleAccess } from "@/lib/api-access";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";
import {
  LIVECHAT_AI_INSIGHTS_ENABLED_KEY,
  LIVECHAT_AUTO_ASSIGN_KEY,
  LIVECHAT_AUTO_CLOSE_ENABLED_KEY,
  LIVECHAT_AUTO_CLOSE_MINUTES_KEY,
  LIVECHAT_MAX_OPEN_PER_AGENT_KEY,
  LIVECHAT_ROUTING_STRATEGY_KEY,
  LIVECHAT_TRANSLATOR_ENABLED_KEY,
  LIVECHAT_TRANSLATOR_SOURCE_KEY,
  LIVECHAT_TRANSLATOR_TARGET_KEY,
  loadLiveChatSettings,
  sanitizeLiveChatSettingsInput,
} from "@/lib/livechat-settings";

export async function GET() {
  const accessResult = await requireModuleAccess("livechat", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const settings = await loadLiveChatSettings(accessResult.ctx.db);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("[GET /api/livechat/settings]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const accessResult = await requireModuleAccess("livechat", "manage");
  if (!accessResult.ok) return accessResult.response;
  const db = accessResult.ctx.db;

  try {
    const body = (await req.json()) as unknown;
    const sanitized = sanitizeLiveChatSettingsInput(body);
    const entries = Object.entries(sanitized);
    if (entries.length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const upserts: Prisma.PrismaPromise<unknown>[] = [];
    if (sanitized.autoAssignEnabled !== undefined) {
      upserts.push(
        db.systemSetting.upsert({
          where: { key: LIVECHAT_AUTO_ASSIGN_KEY },
          create: { key: LIVECHAT_AUTO_ASSIGN_KEY, value: String(sanitized.autoAssignEnabled) },
          update: { value: String(sanitized.autoAssignEnabled) },
        })
      );
    }
    if (sanitized.routingStrategy !== undefined) {
      upserts.push(
        db.systemSetting.upsert({
          where: { key: LIVECHAT_ROUTING_STRATEGY_KEY },
          create: { key: LIVECHAT_ROUTING_STRATEGY_KEY, value: sanitized.routingStrategy },
          update: { value: sanitized.routingStrategy },
        })
      );
    }
    if (sanitized.maxOpenPerAgent !== undefined) {
      upserts.push(
        db.systemSetting.upsert({
          where: { key: LIVECHAT_MAX_OPEN_PER_AGENT_KEY },
          create: {
            key: LIVECHAT_MAX_OPEN_PER_AGENT_KEY,
            value: String(sanitized.maxOpenPerAgent),
          },
          update: { value: String(sanitized.maxOpenPerAgent) },
        })
      );
    }
    if (sanitized.translatorEnabled !== undefined) {
      upserts.push(
        db.systemSetting.upsert({
          where: { key: LIVECHAT_TRANSLATOR_ENABLED_KEY },
          create: {
            key: LIVECHAT_TRANSLATOR_ENABLED_KEY,
            value: String(sanitized.translatorEnabled),
          },
          update: { value: String(sanitized.translatorEnabled) },
        })
      );
    }
    if (sanitized.translatorSourceLang !== undefined) {
      upserts.push(
        db.systemSetting.upsert({
          where: { key: LIVECHAT_TRANSLATOR_SOURCE_KEY },
          create: {
            key: LIVECHAT_TRANSLATOR_SOURCE_KEY,
            value: sanitized.translatorSourceLang,
          },
          update: { value: sanitized.translatorSourceLang },
        })
      );
    }
    if (sanitized.translatorTargetLang !== undefined) {
      upserts.push(
        db.systemSetting.upsert({
          where: { key: LIVECHAT_TRANSLATOR_TARGET_KEY },
          create: {
            key: LIVECHAT_TRANSLATOR_TARGET_KEY,
            value: sanitized.translatorTargetLang,
          },
          update: { value: sanitized.translatorTargetLang },
        })
      );
    }
    if (sanitized.aiInsightsEnabled !== undefined) {
      upserts.push(
        db.systemSetting.upsert({
          where: { key: LIVECHAT_AI_INSIGHTS_ENABLED_KEY },
          create: {
            key: LIVECHAT_AI_INSIGHTS_ENABLED_KEY,
            value: String(sanitized.aiInsightsEnabled),
          },
          update: { value: String(sanitized.aiInsightsEnabled) },
        })
      );
    }
    if (sanitized.autoCloseEnabled !== undefined) {
      upserts.push(
        db.systemSetting.upsert({
          where: { key: LIVECHAT_AUTO_CLOSE_ENABLED_KEY },
          create: {
            key: LIVECHAT_AUTO_CLOSE_ENABLED_KEY,
            value: String(sanitized.autoCloseEnabled),
          },
          update: { value: String(sanitized.autoCloseEnabled) },
        })
      );
    }
    if (sanitized.autoCloseMinutes !== undefined) {
      upserts.push(
        db.systemSetting.upsert({
          where: { key: LIVECHAT_AUTO_CLOSE_MINUTES_KEY },
          create: {
            key: LIVECHAT_AUTO_CLOSE_MINUTES_KEY,
            value: String(sanitized.autoCloseMinutes),
          },
          update: { value: String(sanitized.autoCloseMinutes) },
        })
      );
    }

    await db.$transaction(upserts);

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "LIVECHAT_SETTINGS_UPDATED",
      module: "livechat",
      details: JSON.stringify(sanitized),
      ipAddress: getClientIpAddress(req),
    });

    const settings = await loadLiveChatSettings(db);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("[PATCH /api/livechat/settings]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
