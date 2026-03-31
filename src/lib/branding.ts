export const APP_NAME_KEY = "app.name";
export const APP_TAGLINE_KEY = "app.tagline";
export const LEGACY_APP_NAME_KEY = "app_name";

export const THEME_PRIMARY_KEY = "theme.primary";
export const THEME_SIDEBAR_FROM_KEY = "theme.sidebar.from";
export const THEME_SIDEBAR_MID_KEY = "theme.sidebar.mid";
export const THEME_SIDEBAR_TO_KEY = "theme.sidebar.to";
export const THEME_TOPBAR_FROM_KEY = "theme.topbar.from";
export const THEME_TOPBAR_MID_KEY = "theme.topbar.mid";
export const THEME_TOPBAR_TO_KEY = "theme.topbar.to";
export const THEME_TOPBAR_ACCENT_KEY = "theme.topbar.accent";
export const APP_LOGO_KEY = "app.logo";

export const RUNTIME_SETTINGS_STORAGE_KEY = "zeddash_runtime_settings_v1";
export const BRANDING_UPDATED_EVENT = "zeddash:branding-updated";

export const DEFAULT_APP_NAME = "ZedDash";
export const DEFAULT_APP_TAGLINE = "Workspace";
export const DEFAULT_APP_LOGO = "/logo.png";

export type RuntimeBrandingSettings = Record<string, string>;

export function resolveAppName(value: string | undefined | null) {
  const normalized = String(value ?? "").trim();
  return normalized || DEFAULT_APP_NAME;
}

export function resolveAppTagline(value: string | undefined | null) {
  const normalized = String(value ?? "").trim();
  return normalized || DEFAULT_APP_TAGLINE;
}

export function resolveBranding(settings: Record<string, string | undefined | null>) {
  const rawLogo = (settings[APP_LOGO_KEY] ?? "").trim();
  return {
    appName: resolveAppName(settings[APP_NAME_KEY] ?? settings[LEGACY_APP_NAME_KEY]),
    appTagline: resolveAppTagline(settings[APP_TAGLINE_KEY]),
    logoUrl: rawLogo || DEFAULT_APP_LOGO,
  };
}
