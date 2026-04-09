import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  APP_LOGO_KEY,
  APP_NAME_KEY,
  APP_TAGLINE_KEY,
  DEFAULT_APP_LOGO,
  DEFAULT_APP_NAME,
  DEFAULT_APP_TAGLINE,
  LEGACY_APP_NAME_KEY,
  THEME_PRIMARY_KEY,
  THEME_SIDEBAR_FROM_KEY,
  THEME_SIDEBAR_MID_KEY,
  THEME_SIDEBAR_TO_KEY,
  THEME_TOPBAR_FROM_KEY,
  THEME_TOPBAR_MID_KEY,
  THEME_TOPBAR_TO_KEY,
  THEME_TOPBAR_ACCENT_KEY,
} from "@/lib/branding";

const ALLOWED_KEYS = [
  APP_NAME_KEY,
  LEGACY_APP_NAME_KEY,
  APP_TAGLINE_KEY,
  APP_LOGO_KEY,
  THEME_PRIMARY_KEY,
  THEME_SIDEBAR_FROM_KEY,
  THEME_SIDEBAR_MID_KEY,
  THEME_SIDEBAR_TO_KEY,
  THEME_TOPBAR_FROM_KEY,
  THEME_TOPBAR_MID_KEY,
  THEME_TOPBAR_TO_KEY,
  THEME_TOPBAR_ACCENT_KEY,
] as const;

export async function GET() {
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: [...ALLOWED_KEYS] } },
      select: { key: true, value: true },
    });
    const out = Object.fromEntries(rows.map((row) => [row.key, row.value])) as Record<string, string>;
    if (!out[APP_NAME_KEY] && out[LEGACY_APP_NAME_KEY]) out[APP_NAME_KEY] = out[LEGACY_APP_NAME_KEY];
    if (!out[APP_NAME_KEY]) out[APP_NAME_KEY] = DEFAULT_APP_NAME;
    if (!out[APP_TAGLINE_KEY]) out[APP_TAGLINE_KEY] = DEFAULT_APP_TAGLINE;
    out[APP_LOGO_KEY] = DEFAULT_APP_LOGO;
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({
      [APP_NAME_KEY]: DEFAULT_APP_NAME,
      [APP_TAGLINE_KEY]: DEFAULT_APP_TAGLINE,
      [APP_LOGO_KEY]: DEFAULT_APP_LOGO,
    });
  }
}
