import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

export const LIVECHAT_AUTO_ASSIGN_KEY = "livechat.autoAssign.enabled";
export const LIVECHAT_ROUTING_STRATEGY_KEY = "livechat.routing.strategy";
export const LIVECHAT_MAX_OPEN_PER_AGENT_KEY = "livechat.routing.maxOpenPerAgent";
export const LIVECHAT_TRANSLATOR_ENABLED_KEY = "livechat.translator.enabled";
export const LIVECHAT_TRANSLATOR_SOURCE_KEY = "livechat.translator.source";
export const LIVECHAT_TRANSLATOR_TARGET_KEY = "livechat.translator.target";
export const LIVECHAT_AI_INSIGHTS_ENABLED_KEY = "livechat.aiInsights.enabled";
export const LIVECHAT_AUTO_CLOSE_ENABLED_KEY = "livechat.autoClose.enabled";
export const LIVECHAT_AUTO_CLOSE_MINUTES_KEY = "livechat.autoClose.minutes";
export const LIVECHAT_LAST_ASSIGNED_AGENT_KEY = "livechat.routing.lastAgentId";
export const LIVECHAT_WIDGET_ENABLED_KEY = "livechat.widget.enabled";
export const LIVECHAT_WIDGET_ALLOWLIST_KEY = "livechat.widget.allowlist";
export const LIVECHAT_WIDGET_TOKEN_KEY = "livechat.widget.token";
export const LIVECHAT_WIDGET_BRAND_LABEL_KEY = "livechat.widget.brandLabel";
export const LIVECHAT_WIDGET_WELCOME_TEXT_KEY = "livechat.widget.welcomeText";
export const LIVECHAT_WIDGET_ACCENT_COLOR_KEY = "livechat.widget.accentColor";
export const LIVECHAT_WIDGET_POSITION_KEY = "livechat.widget.position";

export const LIVECHAT_SETTING_KEYS = [
  LIVECHAT_AUTO_ASSIGN_KEY,
  LIVECHAT_ROUTING_STRATEGY_KEY,
  LIVECHAT_MAX_OPEN_PER_AGENT_KEY,
  LIVECHAT_TRANSLATOR_ENABLED_KEY,
  LIVECHAT_TRANSLATOR_SOURCE_KEY,
  LIVECHAT_TRANSLATOR_TARGET_KEY,
  LIVECHAT_AI_INSIGHTS_ENABLED_KEY,
  LIVECHAT_AUTO_CLOSE_ENABLED_KEY,
  LIVECHAT_AUTO_CLOSE_MINUTES_KEY,
  LIVECHAT_LAST_ASSIGNED_AGENT_KEY,
  LIVECHAT_WIDGET_ENABLED_KEY,
  LIVECHAT_WIDGET_ALLOWLIST_KEY,
  LIVECHAT_WIDGET_TOKEN_KEY,
  LIVECHAT_WIDGET_BRAND_LABEL_KEY,
  LIVECHAT_WIDGET_WELCOME_TEXT_KEY,
  LIVECHAT_WIDGET_ACCENT_COLOR_KEY,
  LIVECHAT_WIDGET_POSITION_KEY,
] as const;

export type LiveChatRoutingStrategy = "least_loaded" | "round_robin";

export type LiveChatSettings = {
  autoAssignEnabled: boolean;
  routingStrategy: LiveChatRoutingStrategy;
  maxOpenPerAgent: number;
  translatorEnabled: boolean;
  translatorSourceLang: string;
  translatorTargetLang: string;
  aiInsightsEnabled: boolean;
  autoCloseEnabled: boolean;
  autoCloseMinutes: number;
  lastAssignedAgentId: string | null;
};

export type LiveChatWidgetPosition = "left" | "right";

export type LiveChatWidgetSettings = {
  enabled: boolean;
  allowedDomains: string[];
  token: string;
  brandLabel: string;
  welcomeText: string;
  accentColor: string;
  position: LiveChatWidgetPosition;
};

export const DEFAULT_LIVECHAT_SETTINGS: LiveChatSettings = {
  autoAssignEnabled: true,
  routingStrategy: "least_loaded",
  maxOpenPerAgent: 6,
  translatorEnabled: false,
  translatorSourceLang: "auto",
  translatorTargetLang: "en",
  aiInsightsEnabled: true,
  autoCloseEnabled: false,
  autoCloseMinutes: 120,
  lastAssignedAgentId: null,
};

export const DEFAULT_LIVECHAT_WIDGET_SETTINGS: LiveChatWidgetSettings = {
  enabled: false,
  allowedDomains: ["localhost", "127.0.0.1"],
  token: "",
  brandLabel: "Live Support",
  welcomeText: "Hi there! How can we help you today?",
  accentColor: "#AA8038",
  position: "right",
};

function parseBoolean(value: string | null | undefined, fallback: boolean) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

function parseInteger(
  value: string | null | undefined,
  fallback: number,
  min: number,
  max: number
) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeLanguage(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return fallback;
  if (normalized === "auto") return "auto";
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(normalized)) return fallback;
  return normalized;
}

function normalizeRoutingStrategy(value: string | null | undefined): LiveChatRoutingStrategy {
  if (value?.trim().toLowerCase() === "round_robin") return "round_robin";
  return "least_loaded";
}

function normalizeWidgetPosition(value: string | null | undefined): LiveChatWidgetPosition {
  if (value?.trim().toLowerCase() === "left") return "left";
  return "right";
}

function normalizeColor(value: string | null | undefined, fallback: string) {
  const candidate = value?.trim() ?? "";
  if (!candidate) return fallback;
  if (!/^#[0-9a-fA-F]{6}$/.test(candidate)) return fallback;
  return candidate.toUpperCase();
}

function normalizeLabel(value: string | null | undefined, fallback: string, maxLength = 60) {
  const text = value?.trim() ?? "";
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

export function normalizeDomainAllowList(input: unknown): string[] {
  const rawValues: string[] = [];

  if (Array.isArray(input)) {
    for (const value of input) {
      if (typeof value === "string") rawValues.push(value);
    }
  } else if (typeof input === "string") {
    rawValues.push(...input.split(/[\n,]+/g));
  }

  const unique = new Set<string>();
  const out: string[] = [];

  for (const raw of rawValues) {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) continue;
    if (normalized === "*") {
      if (!unique.has("*")) {
        unique.add("*");
        out.push("*");
      }
      continue;
    }
    if (/^\*\.[a-z0-9.-]+$/.test(normalized) || /^[a-z0-9.-]+$/.test(normalized)) {
      if (!unique.has(normalized)) {
        unique.add(normalized);
        out.push(normalized);
      }
    }
  }

  return out.slice(0, 200);
}

function parseDomainAllowList(raw: string | null | undefined) {
  if (!raw?.trim()) return [...DEFAULT_LIVECHAT_WIDGET_SETTINGS.allowedDomains];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeDomainAllowList(parsed);
    return normalized.length > 0 ? normalized : [...DEFAULT_LIVECHAT_WIDGET_SETTINGS.allowedDomains];
  } catch {
    const normalized = normalizeDomainAllowList(raw);
    return normalized.length > 0 ? normalized : [...DEFAULT_LIVECHAT_WIDGET_SETTINGS.allowedDomains];
  }
}

export function parseLiveChatSettingsFromMap(map: Map<string, string>): LiveChatSettings {
  const routingStrategy = normalizeRoutingStrategy(map.get(LIVECHAT_ROUTING_STRATEGY_KEY));
  return {
    autoAssignEnabled: parseBoolean(
      map.get(LIVECHAT_AUTO_ASSIGN_KEY),
      DEFAULT_LIVECHAT_SETTINGS.autoAssignEnabled
    ),
    routingStrategy,
    maxOpenPerAgent: parseInteger(
      map.get(LIVECHAT_MAX_OPEN_PER_AGENT_KEY),
      DEFAULT_LIVECHAT_SETTINGS.maxOpenPerAgent,
      1,
      100
    ),
    translatorEnabled: parseBoolean(
      map.get(LIVECHAT_TRANSLATOR_ENABLED_KEY),
      DEFAULT_LIVECHAT_SETTINGS.translatorEnabled
    ),
    translatorSourceLang: normalizeLanguage(
      map.get(LIVECHAT_TRANSLATOR_SOURCE_KEY),
      DEFAULT_LIVECHAT_SETTINGS.translatorSourceLang
    ),
    translatorTargetLang: normalizeLanguage(
      map.get(LIVECHAT_TRANSLATOR_TARGET_KEY),
      DEFAULT_LIVECHAT_SETTINGS.translatorTargetLang
    ),
    aiInsightsEnabled: parseBoolean(
      map.get(LIVECHAT_AI_INSIGHTS_ENABLED_KEY),
      DEFAULT_LIVECHAT_SETTINGS.aiInsightsEnabled
    ),
    autoCloseEnabled: parseBoolean(
      map.get(LIVECHAT_AUTO_CLOSE_ENABLED_KEY),
      DEFAULT_LIVECHAT_SETTINGS.autoCloseEnabled
    ),
    autoCloseMinutes: parseInteger(
      map.get(LIVECHAT_AUTO_CLOSE_MINUTES_KEY),
      DEFAULT_LIVECHAT_SETTINGS.autoCloseMinutes,
      5,
      1440
    ),
    lastAssignedAgentId: map.get(LIVECHAT_LAST_ASSIGNED_AGENT_KEY)?.trim() || null,
  };
}

export async function loadLiveChatSettings(db: PrismaClient = prisma) {
  const rows = await db.systemSetting.findMany({
    where: { key: { in: [...LIVECHAT_SETTING_KEYS] } },
    select: { key: true, value: true },
  });
  return parseLiveChatSettingsFromMap(new Map(rows.map((row) => [row.key, row.value])));
}

export function parseLiveChatWidgetSettingsFromMap(map: Map<string, string>): LiveChatWidgetSettings {
  return {
    enabled: parseBoolean(
      map.get(LIVECHAT_WIDGET_ENABLED_KEY),
      DEFAULT_LIVECHAT_WIDGET_SETTINGS.enabled
    ),
    allowedDomains: parseDomainAllowList(map.get(LIVECHAT_WIDGET_ALLOWLIST_KEY)),
    token: map.get(LIVECHAT_WIDGET_TOKEN_KEY)?.trim() || DEFAULT_LIVECHAT_WIDGET_SETTINGS.token,
    brandLabel: normalizeLabel(
      map.get(LIVECHAT_WIDGET_BRAND_LABEL_KEY),
      DEFAULT_LIVECHAT_WIDGET_SETTINGS.brandLabel
    ),
    welcomeText: normalizeLabel(
      map.get(LIVECHAT_WIDGET_WELCOME_TEXT_KEY),
      DEFAULT_LIVECHAT_WIDGET_SETTINGS.welcomeText,
      240
    ),
    accentColor: normalizeColor(
      map.get(LIVECHAT_WIDGET_ACCENT_COLOR_KEY),
      DEFAULT_LIVECHAT_WIDGET_SETTINGS.accentColor
    ),
    position: normalizeWidgetPosition(
      map.get(LIVECHAT_WIDGET_POSITION_KEY)
    ),
  };
}

export async function loadLiveChatWidgetSettings(db: PrismaClient = prisma) {
  const rows = await db.systemSetting.findMany({
    where: {
      key: {
        in: [
          LIVECHAT_WIDGET_ENABLED_KEY,
          LIVECHAT_WIDGET_ALLOWLIST_KEY,
          LIVECHAT_WIDGET_TOKEN_KEY,
          LIVECHAT_WIDGET_BRAND_LABEL_KEY,
          LIVECHAT_WIDGET_WELCOME_TEXT_KEY,
          LIVECHAT_WIDGET_ACCENT_COLOR_KEY,
          LIVECHAT_WIDGET_POSITION_KEY,
        ],
      },
    },
    select: { key: true, value: true },
  });
  return parseLiveChatWidgetSettingsFromMap(new Map(rows.map((row) => [row.key, row.value])));
}

export type LiveChatSettingsInput = Partial<
  Pick<
    LiveChatSettings,
    | "autoAssignEnabled"
    | "routingStrategy"
    | "maxOpenPerAgent"
    | "translatorEnabled"
    | "translatorSourceLang"
    | "translatorTargetLang"
    | "aiInsightsEnabled"
    | "autoCloseEnabled"
    | "autoCloseMinutes"
  >
>;

export type LiveChatWidgetSettingsInput = Partial<
  Pick<
    LiveChatWidgetSettings,
    "enabled" | "allowedDomains" | "brandLabel" | "welcomeText" | "accentColor" | "position"
  >
>;

export function sanitizeLiveChatSettingsInput(input: unknown): LiveChatSettingsInput {
  if (!input || typeof input !== "object") return {};
  const row = input as Record<string, unknown>;
  const out: LiveChatSettingsInput = {};

  if (typeof row.autoAssignEnabled === "boolean") out.autoAssignEnabled = row.autoAssignEnabled;
  if (typeof row.routingStrategy === "string") {
    out.routingStrategy = normalizeRoutingStrategy(row.routingStrategy);
  }
  if (row.maxOpenPerAgent !== undefined) {
    out.maxOpenPerAgent = parseInteger(
      String(row.maxOpenPerAgent),
      DEFAULT_LIVECHAT_SETTINGS.maxOpenPerAgent,
      1,
      100
    );
  }
  if (typeof row.translatorEnabled === "boolean") out.translatorEnabled = row.translatorEnabled;
  if (typeof row.translatorSourceLang === "string") {
    out.translatorSourceLang = normalizeLanguage(
      row.translatorSourceLang,
      DEFAULT_LIVECHAT_SETTINGS.translatorSourceLang
    );
  }
  if (typeof row.translatorTargetLang === "string") {
    out.translatorTargetLang = normalizeLanguage(
      row.translatorTargetLang,
      DEFAULT_LIVECHAT_SETTINGS.translatorTargetLang
    );
  }
  if (typeof row.aiInsightsEnabled === "boolean") out.aiInsightsEnabled = row.aiInsightsEnabled;
  if (typeof row.autoCloseEnabled === "boolean") out.autoCloseEnabled = row.autoCloseEnabled;
  if (row.autoCloseMinutes !== undefined) {
    out.autoCloseMinutes = parseInteger(
      String(row.autoCloseMinutes),
      DEFAULT_LIVECHAT_SETTINGS.autoCloseMinutes,
      5,
      1440
    );
  }

  return out;
}

export function sanitizeLiveChatWidgetSettingsInput(input: unknown): LiveChatWidgetSettingsInput {
  if (!input || typeof input !== "object") return {};
  const row = input as Record<string, unknown>;
  const out: LiveChatWidgetSettingsInput = {};

  if (typeof row.enabled === "boolean") {
    out.enabled = row.enabled;
  }
  if (row.allowedDomains !== undefined) {
    out.allowedDomains = normalizeDomainAllowList(row.allowedDomains);
  }
  if (typeof row.brandLabel === "string") {
    out.brandLabel = normalizeLabel(
      row.brandLabel,
      DEFAULT_LIVECHAT_WIDGET_SETTINGS.brandLabel
    );
  }
  if (typeof row.welcomeText === "string") {
    out.welcomeText = normalizeLabel(
      row.welcomeText,
      DEFAULT_LIVECHAT_WIDGET_SETTINGS.welcomeText,
      240
    );
  }
  if (typeof row.accentColor === "string") {
    out.accentColor = normalizeColor(
      row.accentColor,
      DEFAULT_LIVECHAT_WIDGET_SETTINGS.accentColor
    );
  }
  if (typeof row.position === "string") {
    out.position = normalizeWidgetPosition(row.position);
  }

  return out;
}

export function isDomainAllowed(host: string | null | undefined, allowList: string[]) {
  const normalizedHost = host?.trim().toLowerCase() ?? "";
  if (!normalizedHost) return false;
  if (allowList.includes("*")) return true;

  for (const raw of allowList) {
    const item = raw.trim().toLowerCase();
    if (!item) continue;
    if (item === normalizedHost) return true;
    if (item.startsWith("*.")) {
      const suffix = item.slice(2);
      if (suffix && (normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`))) {
        return true;
      }
    }
  }

  return false;
}
