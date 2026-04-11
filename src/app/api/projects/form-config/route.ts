import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { loadProjectFormFields } from "@/lib/project-form-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const accessResult = await requireModuleAccess("projects", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const fields = await loadProjectFormFields();
    return NextResponse.json(
      { fields },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error) {
    console.error("[GET /api/projects/form-config]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
