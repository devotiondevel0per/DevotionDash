import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDomainAllowed, loadLiveChatWidgetSettings } from "@/lib/livechat-settings";
import { getRequestHost, verifyWidgetHostGrant } from "@/lib/livechat-widget-auth";

export type WidgetConfig = {
  brandLabel: string;
  logoUrl?: string | null;
  welcomeText: string;
  accentColor: string;
  position: "left" | "right";
  widgetId?: string;
  widgetName?: string;
};

export type WidgetAccessResult =
  | {
      ok: true;
      host: string;
      widget: WidgetConfig;
    }
  | {
      ok: false;
      status: number;
      error: string;
      host: string | null;
    };

export async function validateWidgetAccess(
  req: NextRequest,
  providedToken: string | null | undefined,
  overrideHost?: string | null,
  hostGrant?: string | null
): Promise<WidgetAccessResult> {
  const token = providedToken?.trim() ?? "";
  const normalizedOverride = overrideHost?.trim().toLowerCase() ?? "";
  const verifiedOverride =
    normalizedOverride && verifyWidgetHostGrant(normalizedOverride, hostGrant)
      ? normalizedOverride
      : null;
  const host = verifiedOverride || getRequestHost(req.headers);

  // ── 1. Try per-website widget from LiveChatWidget table ──
  if (token) {
    const perWidget = await prisma.liveChatWidget.findUnique({ where: { token } });
    if (perWidget) {
      if (!perWidget.enabled) {
        return { ok: false, status: 403, error: "Widget is disabled", host };
      }

      // Parse allowDomains (newline or comma separated)
      const allowedDomains: string[] = perWidget.allowDomains
        ? perWidget.allowDomains
            .split(/[\n,]+/)
            .map((d) => d.trim().toLowerCase())
            .filter(Boolean)
        : ["*"]; // no restriction if empty

      if (!isDomainAllowed(host, allowedDomains)) {
        return { ok: false, status: 403, error: "Domain not allowed", host };
      }

      return {
        ok: true,
        host: host || "",
        widget: {
          brandLabel: perWidget.brandLabel,
          logoUrl: perWidget.logoUrl,
          welcomeText: perWidget.welcomeText,
          accentColor: perWidget.accentColor,
          position: perWidget.position === "left" ? "left" : "right",
          widgetId: perWidget.id,
          widgetName: perWidget.name,
        },
      };
    }
  }

  // ── 2. Fall back to global system settings ──
  const widget = await loadLiveChatWidgetSettings();

  if (!widget.enabled) {
    return { ok: false, status: 403, error: "Widget is disabled", host };
  }
  if (!widget.token || !token || token !== widget.token) {
    return { ok: false, status: 401, error: "Invalid widget token", host };
  }
  if (!isDomainAllowed(host, widget.allowedDomains)) {
    return { ok: false, status: 403, error: "Domain not allowed", host };
  }

  return {
    ok: true,
    host: host || "",
    widget: {
      brandLabel: widget.brandLabel,
      welcomeText: widget.welcomeText,
      accentColor: widget.accentColor,
      position: widget.position,
    },
  };
}
