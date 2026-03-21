import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { generateWidgetToken } from "@/lib/livechat-widget-auth";

export async function GET() {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const widgets = await prisma.liveChatWidget.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(widgets);
  } catch (error) {
    console.error("[GET /api/administration/livechat/widgets]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as {
      name?: string;
      domain?: string;
      brandLabel?: string;
      logoUrl?: string;
      welcomeText?: string;
      accentColor?: string;
      position?: string;
      allowDomains?: string;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Widget name is required" }, { status: 400 });
    }

    const token = generateWidgetToken();

    const widget = await prisma.liveChatWidget.create({
      data: {
        name,
        domain: typeof body.domain === "string" ? body.domain.trim() || null : null,
        token,
        enabled: true,
        brandLabel: typeof body.brandLabel === "string" ? body.brandLabel.trim() || "Chat with us" : "Chat with us",
        logoUrl: typeof body.logoUrl === "string" ? body.logoUrl.trim() || null : null,
        welcomeText: typeof body.welcomeText === "string" ? body.welcomeText.trim() || "Hi! How can we help you today?" : "Hi! How can we help you today?",
        accentColor: typeof body.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.accentColor) ? body.accentColor : "#FE0000",
        position: body.position === "left" ? "left" : "right",
        allowDomains: typeof body.allowDomains === "string" ? body.allowDomains.trim() || null : null,
      },
    });

    return NextResponse.json(widget, { status: 201 });
  } catch (error) {
    console.error("[POST /api/administration/livechat/widgets]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
