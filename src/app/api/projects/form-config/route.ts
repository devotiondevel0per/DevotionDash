import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { loadProjectFormFields } from "@/lib/project-form-config";

export async function GET() {
  const accessResult = await requireModuleAccess("projects", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const fields = await loadProjectFormFields();
    return NextResponse.json({ fields });
  } catch (error) {
    console.error("[GET /api/projects/form-config]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
