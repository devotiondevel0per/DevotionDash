import { NextRequest, NextResponse } from "next/server";
import { validateWidgetAccess } from "@/lib/livechat-widget-access";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    const siteHost = req.nextUrl.searchParams.get("site");
    const hostGrant = req.nextUrl.searchParams.get("grant");
    const access = await validateWidgetAccess(req, token, siteHost, hostGrant);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    return NextResponse.json({
      enabled: true,
      brandLabel: access.widget.brandLabel,
      logoUrl: access.widget.logoUrl ?? null,
      widgetName: access.widget.widgetName ?? null,
      welcomeText: access.widget.welcomeText,
      accentColor: access.widget.accentColor,
      position: access.widget.position,
      domain: access.host,
    });
  } catch (error) {
    console.error("[GET /api/public/livechat/config]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
