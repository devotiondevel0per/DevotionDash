"use client";

import { useEffect } from "react";
import {
  APP_NAME_KEY,
  APP_TAGLINE_KEY,
  BRANDING_UPDATED_EVENT,
  DEFAULT_APP_NAME,
  DEFAULT_APP_TAGLINE,
  RUNTIME_SETTINGS_STORAGE_KEY,
  THEME_PRIMARY_KEY,
  THEME_SIDEBAR_FROM_KEY,
  THEME_SIDEBAR_MID_KEY,
  THEME_SIDEBAR_TO_KEY,
  THEME_TOPBAR_ACCENT_KEY,
  THEME_TOPBAR_FROM_KEY,
  THEME_TOPBAR_MID_KEY,
  THEME_TOPBAR_TO_KEY,
  resolveBranding,
} from "@/lib/branding";

type SettingsMap = Record<string, string>;

export type AppBrandingDetail = {
  appName: string;
  appTagline: string;
  logoUrl?: string;
};

function normalizeHex(value: string | undefined, fallback: string) {
  const raw = (value ?? "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw;
  return fallback;
}

function applySettings(settings: SettingsMap) {
  const root = document.documentElement;
  const primary = normalizeHex(settings[THEME_PRIMARY_KEY], "#AA8038");
  const sidebarFrom = normalizeHex(settings[THEME_SIDEBAR_FROM_KEY], "#6E4C0D");
  const sidebarMid = normalizeHex(settings[THEME_SIDEBAR_MID_KEY], "#563C0D");
  const sidebarTo = normalizeHex(settings[THEME_SIDEBAR_TO_KEY], "#453311");
  const topbarFrom = normalizeHex(settings[THEME_TOPBAR_FROM_KEY], "#67470B");
  const topbarMid = normalizeHex(settings[THEME_TOPBAR_MID_KEY], "#8E610C");
  const topbarTo = normalizeHex(settings[THEME_TOPBAR_TO_KEY], "#BF8210");
  const topbarAccent = normalizeHex(settings[THEME_TOPBAR_ACCENT_KEY], primary);

  root.style.setProperty("--primary", primary);
  root.style.setProperty("--ring", primary);
  root.style.setProperty("--sidebar-primary", primary);
  root.style.setProperty("--twx-primary", primary);

  root.style.setProperty("--twx-sidebar-from", sidebarFrom);
  root.style.setProperty("--twx-sidebar-mid", sidebarMid);
  root.style.setProperty("--twx-sidebar-to", sidebarTo);

  root.style.setProperty("--twx-topbar-from", topbarFrom);
  root.style.setProperty("--twx-topbar-mid", topbarMid);
  root.style.setProperty("--twx-topbar-to", topbarTo);
  root.style.setProperty("--twx-topbar-accent", topbarAccent);

  const { appName, appTagline, logoUrl } = resolveBranding(settings);
  const detail: AppBrandingDetail = { appName, appTagline, logoUrl: logoUrl ?? "" };
  window.dispatchEvent(new CustomEvent<AppBrandingDetail>(BRANDING_UPDATED_EVENT, { detail }));
  if (document.title) {
    document.title = appName;
  }
}

export function SystemThemeBootstrap() {
  useEffect(() => {
    let active = true;

    // Apply cached values immediately for perceived performance.
    try {
      const raw = window.localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as SettingsMap;
        applySettings(cached);
      }
    } catch {
      // no-op
    }

    fetch("/api/public/branding", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load runtime branding");
        return response.json() as Promise<SettingsMap>;
      })
      .then((settings) => {
        if (!active) return;
        applySettings(settings);
        try {
          window.localStorage.setItem(RUNTIME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        } catch {
          // no-op
        }
      })
      .catch(() => {
        // Keep defaults if branding endpoint is unavailable.
        applySettings({
          [APP_NAME_KEY]: DEFAULT_APP_NAME,
          [APP_TAGLINE_KEY]: DEFAULT_APP_TAGLINE,
        });
      });

    return () => {
      active = false;
    };
  }, []);

  return null;
}
