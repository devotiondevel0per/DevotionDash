import { prisma } from "@/lib/prisma";
import {
  APP_NAME_KEY,
  APP_TAGLINE_KEY,
  DEFAULT_APP_NAME,
  DEFAULT_APP_TAGLINE,
  LEGACY_APP_NAME_KEY,
  resolveBranding,
} from "@/lib/branding";

export async function getServerBranding() {
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: [APP_NAME_KEY, LEGACY_APP_NAME_KEY, APP_TAGLINE_KEY] } },
      select: { key: true, value: true },
    });
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return resolveBranding(settings);
  } catch {
    return { appName: DEFAULT_APP_NAME, appTagline: DEFAULT_APP_TAGLINE };
  }
}
