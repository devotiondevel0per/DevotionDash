import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  PROJECT_FORM_SCHEMA_SETTING_KEY,
  loadProjectFormFields,
  sanitizeProjectFormFields,
} from "@/lib/project-form-config";

export async function GET() {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const fields = await loadProjectFormFields();
    return NextResponse.json({ fields });
  } catch (error) {
    console.error("[GET /api/administration/project-form-config]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as { fields?: unknown };
    const fields = sanitizeProjectFormFields(body.fields);

    await prisma.systemSetting.upsert({
      where: { key: PROJECT_FORM_SCHEMA_SETTING_KEY },
      update: { value: JSON.stringify(fields) },
      create: { key: PROJECT_FORM_SCHEMA_SETTING_KEY, value: JSON.stringify(fields) },
    });

    return NextResponse.json({ ok: true, fields });
  } catch (error) {
    console.error("[PUT /api/administration/project-form-config]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
