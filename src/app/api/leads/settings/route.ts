import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  LEAD_SOURCE_OPTIONS_KEY,
  LEAD_STAGE_SETTING_KEY,
  loadLeadSourceOptions,
  loadLeadStageFlow,
  sanitizeLeadSourceOptions,
  sanitizeLeadStageFlow,
} from "@/lib/leads";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

export async function GET() {
  const accessResult = await requireModuleAccess("leads", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const [stageFlow, sourceOptions] = await Promise.all([
      loadLeadStageFlow(),
      loadLeadSourceOptions(),
    ]);

    return NextResponse.json({
      stageFlow,
      sourceOptions,
    });
  } catch (error) {
    console.error("[GET /api/leads/settings]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const accessResult = await requireModuleAccess("leads", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as {
      stageFlow?: unknown;
      sourceOptions?: unknown;
    };

    const stageFlow = body.stageFlow === undefined ? null : sanitizeLeadStageFlow(body.stageFlow);
    const sourceOptions =
      body.sourceOptions === undefined ? null : sanitizeLeadSourceOptions(body.sourceOptions);

    if (stageFlow === null && sourceOptions === null) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      if (stageFlow) {
        await tx.systemSetting.upsert({
          where: { key: LEAD_STAGE_SETTING_KEY },
          create: { key: LEAD_STAGE_SETTING_KEY, value: JSON.stringify(stageFlow) },
          update: { value: JSON.stringify(stageFlow) },
        });
      }

      if (sourceOptions) {
        await tx.systemSetting.upsert({
          where: { key: LEAD_SOURCE_OPTIONS_KEY },
          create: { key: LEAD_SOURCE_OPTIONS_KEY, value: JSON.stringify(sourceOptions) },
          update: { value: JSON.stringify(sourceOptions) },
        });
      }
    });

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "LEAD_SETTINGS_UPDATED",
      module: "leads",
      details: JSON.stringify({
        stageFlowCount: stageFlow?.length ?? undefined,
        sourceOptionCount: sourceOptions?.length ?? undefined,
      }),
      ipAddress: getClientIpAddress(req),
    });

    const [savedStageFlow, savedSourceOptions] = await Promise.all([
      loadLeadStageFlow(),
      loadLeadSourceOptions(),
    ]);

    return NextResponse.json({
      stageFlow: savedStageFlow,
      sourceOptions: savedSourceOptions,
    });
  } catch (error) {
    console.error("[PATCH /api/leads/settings]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
