"use client";

import { useEffect, useState } from "react";
import {
  BRANDING_UPDATED_EVENT,
  DEFAULT_APP_NAME,
  DEFAULT_APP_TAGLINE,
  RUNTIME_SETTINGS_STORAGE_KEY,
  resolveBranding,
} from "@/lib/branding";

type BrandingState = {
  appName: string;
  appTagline: string;
};

export function useAppBranding() {
  const [branding, setBranding] = useState<BrandingState>({
    appName: DEFAULT_APP_NAME,
    appTagline: DEFAULT_APP_TAGLINE,
  });

  useEffect(() => {
    let mounted = true;

    const apply = (settings: Record<string, string | undefined | null>) => {
      if (!mounted) return;
      setBranding(resolveBranding(settings));
    };

    try {
      const raw = window.localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY);
      if (raw) apply(JSON.parse(raw) as Record<string, string>);
    } catch {
      // no-op
    }

    fetch("/api/public/branding", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load branding");
        return (await response.json()) as Record<string, string>;
      })
      .then((settings) => {
        apply(settings);
        try {
          window.localStorage.setItem(RUNTIME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        } catch {
          // no-op
        }
      })
      .catch(() => {
        // no-op
      });

    const onBrandingChanged = (event: Event) => {
      const detail = (event as CustomEvent<BrandingState>).detail;
      if (!detail) return;
      setBranding({
        appName: detail.appName || DEFAULT_APP_NAME,
        appTagline: detail.appTagline || DEFAULT_APP_TAGLINE,
      });
    };

    window.addEventListener(BRANDING_UPDATED_EVENT, onBrandingChanged);
    return () => {
      mounted = false;
      window.removeEventListener(BRANDING_UPDATED_EVENT, onBrandingChanged);
    };
  }, []);

  return branding;
}

