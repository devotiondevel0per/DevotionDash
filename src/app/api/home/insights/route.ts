import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { getHomeDashboardData } from "@/lib/home/dashboard";
import { generateHomeInsights } from "@/lib/ai/home-insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const accessResult = await requireModuleAccess("home", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const data = await getHomeDashboardData(accessResult.ctx.userId);
    const insights = await generateHomeInsights(data);
    return NextResponse.json(insights);
  } catch (error) {
    console.error("[GET /api/home/insights]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
