import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  MODULE_TOGGLES_KEY,
  getDefaultEnabledModules,
  normalizeEnabledModules,
  parseEnabledModulesSetting,
} from "@/lib/admin-config";
import { moduleIds } from "@/lib/permissions";
import { writeAuditLog, getClientIpAddress } from "@/lib/audit-log";

const ALWAYS_ENABLED = new Set(["home", "search", "administration"]);

export async function GET() {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: MODULE_TOGGLES_KEY },
      select: { value: true },
    });
    const enabled = parseEnabledModulesSetting(setting?.value);

    return NextResponse.json({
      enabledModules: enabled,
      defaults: getDefaultEnabledModules(),
      modules: moduleIds.map((id) => ({
        id,
        enabled: enabled.includes(id),
        locked: ALWAYS_ENABLED.has(id),
      })),
    });
  } catch (error) {
    console.error("[GET /api/administration/modules]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as { enabledModules?: string[] };
    const enabledModules = normalizeEnabledModules(body.enabledModules);

    await prisma.systemSetting.upsert({
      where: { key: MODULE_TOGGLES_KEY },
      create: { key: MODULE_TOGGLES_KEY, value: JSON.stringify(enabledModules) },
      update: { value: JSON.stringify(enabledModules) },
    });

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "MODULE_TOGGLES_UPDATED",
      module: "administration",
      details: JSON.stringify({ enabledModules }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({ success: true, enabledModules });
  } catch (error) {
    console.error("[PUT /api/administration/modules]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

