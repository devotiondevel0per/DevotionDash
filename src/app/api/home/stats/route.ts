import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { getHomeDashboardData } from "@/lib/home/dashboard";

export async function GET() {
  const accessResult = await requireModuleAccess("home", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const data = await getHomeDashboardData(accessResult.ctx.userId);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/home/stats]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
