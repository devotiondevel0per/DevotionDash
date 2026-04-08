import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadLiveChatWidgetSettings } from "@/lib/livechat-settings";
import { buildWidgetHostGrant, getRequestHost } from "@/lib/livechat-widget-auth";

function noOpScript(message: string) {
  return `(() => { try { console.warn(${JSON.stringify(message)}); } catch {} })();`;
}

function getServerOrigin(req: NextRequest): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/$/, "");
  const host = req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token")?.trim() ?? "";
    const serverOrigin = getServerOrigin(req);

    let position = "right";
    let accent = "#AA8038";
    let brand = "Live Support";

    if (token) {
      const perWidget = await prisma.liveChatWidget.findUnique({ where: { token } });
      if (perWidget) {
        if (!perWidget.enabled) {
          return new NextResponse(noOpScript("Livechat widget is disabled."), {
            headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
          });
        }
        position = perWidget.position === "left" ? "left" : "right";
        accent = perWidget.accentColor || "#AA8038";
        brand = perWidget.brandLabel || "Live Support";

        const requestHost = getRequestHost(req.headers);
        const host = requestHost?.trim().toLowerCase() ?? "";
        const hostGrant = host ? buildWidgetHostGrant(host) : "";
        const widgetUrl = `${serverOrigin}/chat/widget?token=${encodeURIComponent(token)}${
          host ? `&site=${encodeURIComponent(host)}&grant=${encodeURIComponent(hostGrant)}` : ""
        }`;
        return new NextResponse(buildLoaderScript(widgetUrl, position, accent, brand), {
          headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
        });
      }
    }

    const widget = await loadLiveChatWidgetSettings();

    if (!widget.enabled) {
      return new NextResponse(noOpScript("Livechat widget is disabled."), {
        headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (!widget.token || token !== widget.token) {
      return new NextResponse(noOpScript("Livechat widget token is invalid."), {
        headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
      });
    }

    const requestHost = getRequestHost(req.headers);
    const host = requestHost?.trim().toLowerCase() ?? "";
    const hostGrant = host ? buildWidgetHostGrant(host) : "";
    const widgetUrl = `${serverOrigin}/chat/widget?token=${encodeURIComponent(token)}${
      host ? `&site=${encodeURIComponent(host)}&grant=${encodeURIComponent(hostGrant)}` : ""
    }`;
    position = widget.position === "left" ? "left" : "right";
    accent = widget.accentColor || "#AA8038";
    brand = widget.brandLabel || "Live Support";
    return new NextResponse(buildLoaderScript(widgetUrl, position, accent, brand), {
      headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("[GET /api/public/livechat/loader]", error);
    return new NextResponse(noOpScript("Livechat loader failed."), {
      headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

function buildLoaderScript(widgetUrl: string, position: string, accent: string, brand: string) {
  const buttonOffset = "22px";
  return `(() => {
  if (window.__zedDashLivechatLoaded) return;
  window.__zedDashLivechatLoaded = "pending";

  const mount = () => {
    try {
      if (!document.body) return false;
      if (document.getElementById("zeddash-livechat-root")) {
        window.__zedDashLivechatLoaded = true;
        return true;
      }

      const root = document.createElement("div");
      root.id = "zeddash-livechat-root";
      root.style.position = "fixed";
      root.style.zIndex = "2147483000";
      root.style.${position} = "${buttonOffset}";
      root.style.bottom = "${buttonOffset}";
      root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
      root.style.maxWidth = "calc(100vw - 8px)";

      const panel = document.createElement("iframe");
      panel.src = ${JSON.stringify(widgetUrl)};
      panel.title = ${JSON.stringify(brand)};
      panel.style.width = "340px";
      panel.style.maxWidth = "calc(100vw - 24px)";
      panel.style.height = "480px";
      panel.style.maxHeight = "calc(100vh - 90px)";
      panel.style.border = "1px solid #F0E7D6";
      panel.style.borderRadius = "18px";
      panel.style.boxShadow = "0 28px 64px -20px rgba(43, 8, 11, 0.35)";
      panel.style.background = "#fff";
      panel.style.display = "none";

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "\\uD83D\\uDCAC";
      button.title = ${JSON.stringify(brand)};
      button.style.height = "52px";
      button.style.width = "52px";
      button.style.padding = "0";
      button.style.border = "0";
      button.style.borderRadius = "999px";
      button.style.background = ${JSON.stringify(accent)};
      button.style.color = "#fff";
      button.style.fontSize = "22px";
      button.style.cursor = "pointer";
      button.style.boxShadow = "0 16px 34px -18px rgba(33, 6, 8, 0.65)";
      button.style.marginTop = "10px";
      button.style.display = "flex";
      button.style.alignItems = "center";
      button.style.justifyContent = "center";
      button.style.touchAction = "manipulation";

      function applyViewportLayout() {
        const mobile = window.innerWidth <= 640;
        const safeBottom = "max(8px, env(safe-area-inset-bottom, 0px))";
        if (mobile) {
          root.style.left = "8px";
          root.style.right = "8px";
          root.style.bottom = safeBottom;
          panel.style.width = "calc(100vw - 16px)";
          panel.style.maxWidth = "calc(100vw - 16px)";
          panel.style.height = "min(72vh, 560px)";
          panel.style.maxHeight = "min(72vh, 560px)";
          panel.style.borderRadius = "14px";
        } else {
          root.style.left = "auto";
          root.style.top = "auto";
          root.style.${position} = "${buttonOffset}";
          root.style.bottom = "${buttonOffset}";
          panel.style.width = "340px";
          panel.style.maxWidth = "calc(100vw - 24px)";
          panel.style.height = "480px";
          panel.style.maxHeight = "calc(100vh - 90px)";
          panel.style.borderRadius = "18px";
        }
      }

      function setOpen(next) {
        panel.style.display = next ? "block" : "none";
        button.textContent = next ? "\\u00D7" : "\\uD83D\\uDCAC";
        button.style.fontSize = next ? "24px" : "22px";
      }

      let open = false;
      button.addEventListener("click", () => {
        open = !open;
        setOpen(open);
      });

      window.addEventListener("resize", applyViewportLayout, { passive: true });
      window.addEventListener("orientationchange", applyViewportLayout, { passive: true });

      window.addEventListener("message", (event) => {
        if (!event || !event.data) return;
        if (event.data.type === "zedchat:close") {
          open = false;
          setOpen(open);
          return;
        }
        if (event.data.type === "zedchat:move" && window.innerWidth > 640) {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const rootRect = root.getBoundingClientRect();
          const newRight = Math.max(8, Math.min(vw - rootRect.width - 8, event.data.origRight - event.data.dx));
          const newBottom = Math.max(8, Math.min(vh - rootRect.height - 8, event.data.origBottom - event.data.dy));
          root.style.right = "auto";
          root.style.left = "auto";
          root.style.bottom = "auto";
          root.style.top = "auto";
          root.style.right = newRight + "px";
          root.style.bottom = newBottom + "px";
        }
      });

      root.appendChild(panel);
      root.appendChild(button);
      document.body.appendChild(root);
      applyViewportLayout();
      window.__zedDashLivechatLoaded = true;
      return true;
    } catch (error) {
      window.__zedDashLivechatLoaded = false;
      try { console.error("Failed to mount livechat widget", error); } catch {}
      return false;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
    setTimeout(mount, 350);
  } else {
    mount();
  }
})();`;
}
