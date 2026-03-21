import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { prisma } from "@/lib/prisma";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";
import {
  LIVECHAT_WIDGET_ACCENT_COLOR_KEY,
  LIVECHAT_WIDGET_ALLOWLIST_KEY,
  LIVECHAT_WIDGET_BRAND_LABEL_KEY,
  LIVECHAT_WIDGET_ENABLED_KEY,
  LIVECHAT_WIDGET_POSITION_KEY,
  LIVECHAT_WIDGET_TOKEN_KEY,
  LIVECHAT_WIDGET_WELCOME_TEXT_KEY,
  loadLiveChatWidgetSettings,
  sanitizeLiveChatWidgetSettingsInput,
} from "@/lib/livechat-settings";
import { generateWidgetToken } from "@/lib/livechat-widget-auth";

function buildLoaderUrl(origin: string, token: string) {
  return `${origin}/api/public/livechat/loader?token=${encodeURIComponent(token)}`;
}

function toEmbedSnippet(loaderUrl: string) {
  return `<script async src="${loaderUrl}"></script>`;
}

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("livechat", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    let widget = await loadLiveChatWidgetSettings();
    if (!widget.token) {
      const token = generateWidgetToken();
      await prisma.systemSetting.upsert({
        where: { key: LIVECHAT_WIDGET_TOKEN_KEY },
        create: { key: LIVECHAT_WIDGET_TOKEN_KEY, value: token },
        update: { value: token },
      });
      widget = { ...widget, token };
    }

    const loaderUrl = buildLoaderUrl(req.nextUrl.origin, widget.token);
    return NextResponse.json({
      ...widget,
      loaderUrl,
      widgetUrl: `${req.nextUrl.origin}/chat/widget?token=${encodeURIComponent(widget.token)}`,
      embedScript: toEmbedSnippet(loaderUrl),
    });
  } catch (error) {
    console.error("[GET /api/livechat/widget]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const accessResult = await requireModuleAccess("livechat", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as unknown;
    const input = sanitizeLiveChatWidgetSettingsInput(body);

    const updates: Prisma.PrismaPromise<unknown>[] = [];
    if (input.enabled !== undefined) {
      updates.push(
        prisma.systemSetting.upsert({
          where: { key: LIVECHAT_WIDGET_ENABLED_KEY },
          create: { key: LIVECHAT_WIDGET_ENABLED_KEY, value: String(input.enabled) },
          update: { value: String(input.enabled) },
        })
      );
    }
    if (input.allowedDomains !== undefined) {
      updates.push(
        prisma.systemSetting.upsert({
          where: { key: LIVECHAT_WIDGET_ALLOWLIST_KEY },
          create: {
            key: LIVECHAT_WIDGET_ALLOWLIST_KEY,
            value: JSON.stringify(input.allowedDomains),
          },
          update: { value: JSON.stringify(input.allowedDomains) },
        })
      );
    }
    if (input.brandLabel !== undefined) {
      updates.push(
        prisma.systemSetting.upsert({
          where: { key: LIVECHAT_WIDGET_BRAND_LABEL_KEY },
          create: { key: LIVECHAT_WIDGET_BRAND_LABEL_KEY, value: input.brandLabel },
          update: { value: input.brandLabel },
        })
      );
    }
    if (input.welcomeText !== undefined) {
      updates.push(
        prisma.systemSetting.upsert({
          where: { key: LIVECHAT_WIDGET_WELCOME_TEXT_KEY },
          create: { key: LIVECHAT_WIDGET_WELCOME_TEXT_KEY, value: input.welcomeText },
          update: { value: input.welcomeText },
        })
      );
    }
    if (input.accentColor !== undefined) {
      updates.push(
        prisma.systemSetting.upsert({
          where: { key: LIVECHAT_WIDGET_ACCENT_COLOR_KEY },
          create: { key: LIVECHAT_WIDGET_ACCENT_COLOR_KEY, value: input.accentColor },
          update: { value: input.accentColor },
        })
      );
    }
    if (input.position !== undefined) {
      updates.push(
        prisma.systemSetting.upsert({
          where: { key: LIVECHAT_WIDGET_POSITION_KEY },
          create: { key: LIVECHAT_WIDGET_POSITION_KEY, value: input.position },
          update: { value: input.position },
        })
      );
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await prisma.$transaction(updates);

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "LIVECHAT_WIDGET_SETTINGS_UPDATED",
      module: "livechat",
      details: JSON.stringify(input),
      ipAddress: getClientIpAddress(req),
    });

    const widget = await loadLiveChatWidgetSettings();
    const token = widget.token || generateWidgetToken();
    if (!widget.token) {
      await prisma.systemSetting.upsert({
        where: { key: LIVECHAT_WIDGET_TOKEN_KEY },
        create: { key: LIVECHAT_WIDGET_TOKEN_KEY, value: token },
        update: { value: token },
      });
    }

    const loaderUrl = buildLoaderUrl(req.nextUrl.origin, token);
    return NextResponse.json({
      ...widget,
      token,
      loaderUrl,
      widgetUrl: `${req.nextUrl.origin}/chat/widget?token=${encodeURIComponent(token)}`,
      embedScript: toEmbedSnippet(loaderUrl),
    });
  } catch (error) {
    console.error("[PATCH /api/livechat/widget]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("livechat", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const token = generateWidgetToken();
    await prisma.systemSetting.upsert({
      where: { key: LIVECHAT_WIDGET_TOKEN_KEY },
      create: { key: LIVECHAT_WIDGET_TOKEN_KEY, value: token },
      update: { value: token },
    });

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "LIVECHAT_WIDGET_TOKEN_ROTATED",
      module: "livechat",
      details: JSON.stringify({ tokenPrefix: token.slice(0, 8) }),
      ipAddress: getClientIpAddress(req),
    });

    const widget = await loadLiveChatWidgetSettings();
    const loaderUrl = buildLoaderUrl(req.nextUrl.origin, token);
    return NextResponse.json({
      ...widget,
      token,
      loaderUrl,
      widgetUrl: `${req.nextUrl.origin}/chat/widget?token=${encodeURIComponent(token)}`,
      embedScript: toEmbedSnippet(loaderUrl),
    });
  } catch (error) {
    console.error("[POST /api/livechat/widget]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

