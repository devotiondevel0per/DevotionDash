import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  TASK_FORM_SCHEMA_SETTING_KEY,
  loadTaskFormFields,
  sanitizeTaskFormFields,
} from "@/lib/task-form-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const fields = await loadTaskFormFields();
    return NextResponse.json(
      { fields },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error) {
    console.error("[GET /api/administration/task-form-config]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as { fields?: unknown };
    const fields = sanitizeTaskFormFields(body.fields);

    await prisma.systemSetting.upsert({
      where: { key: TASK_FORM_SCHEMA_SETTING_KEY },
      update: { value: JSON.stringify(fields) },
      create: { key: TASK_FORM_SCHEMA_SETTING_KEY, value: JSON.stringify(fields) },
    });

    return NextResponse.json({ ok: true, fields });
  } catch (error) {
    console.error("[PUT /api/administration/task-form-config]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

