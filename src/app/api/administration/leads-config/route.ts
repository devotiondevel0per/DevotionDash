import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";
import {
  LEAD_CUSTOM_FIELDS_KEY,
  LEAD_FORM_FIELDS_KEY,
  LEAD_SOURCE_OPTIONS_KEY,
  LEAD_STAGE_SETTING_KEY,
  loadLeadCustomFields,
  loadLeadFormFields,
  loadLeadSourceOptions,
  loadLeadStageFlow,
  sanitizeLeadCustomFields,
  sanitizeLeadFormFields,
  sanitizeLeadSourceOptions,
  sanitizeLeadStageFlow,
} from "@/lib/leads";

export async function GET() {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const [stageFlow, sourceOptions, formFields, customFields] = await Promise.all([
      loadLeadStageFlow(),
      loadLeadSourceOptions(),
      loadLeadFormFields(),
      loadLeadCustomFields(),
    ]);

    return NextResponse.json({ stageFlow, sourceOptions, formFields, customFields });
  } catch (error) {
    console.error("[GET /api/administration/leads-config]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as {
      stageFlow?: unknown;
      sourceOptions?: unknown;
      formFields?: unknown;
      customFields?: unknown;
    };

    const stageFlow = body.stageFlow === undefined ? null : sanitizeLeadStageFlow(body.stageFlow);
    const sourceOptions = body.sourceOptions === undefined ? null : sanitizeLeadSourceOptions(body.sourceOptions);
    const formFields = body.formFields === undefined ? null : sanitizeLeadFormFields(body.formFields);
    const customFields = body.customFields === undefined ? null : sanitizeLeadCustomFields(body.customFields);

    if (stageFlow === null && sourceOptions === null && formFields === null && customFields === null) {
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
      if (formFields) {
        await tx.systemSetting.upsert({
          where: { key: LEAD_FORM_FIELDS_KEY },
          create: { key: LEAD_FORM_FIELDS_KEY, value: JSON.stringify(formFields) },
          update: { value: JSON.stringify(formFields) },
        });
      }
      // customFields can be an empty array (clearing all)
      if (customFields !== null) {
        await tx.systemSetting.upsert({
          where: { key: LEAD_CUSTOM_FIELDS_KEY },
          create: { key: LEAD_CUSTOM_FIELDS_KEY, value: JSON.stringify(customFields) },
          update: { value: JSON.stringify(customFields) },
        });
      }
    });

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "LEAD_CONFIG_UPDATED",
      module: "administration",
      details: JSON.stringify({
        stageFlowCount: stageFlow?.length,
        sourceOptionCount: sourceOptions?.length,
        formFieldCount: formFields?.length,
        customFieldCount: customFields?.length,
      }),
      ipAddress: getClientIpAddress(req),
    });

    const [savedStageFlow, savedSourceOptions, savedFormFields, savedCustomFields] = await Promise.all([
      loadLeadStageFlow(),
      loadLeadSourceOptions(),
      loadLeadFormFields(),
      loadLeadCustomFields(),
    ]);

    return NextResponse.json({
      stageFlow: savedStageFlow,
      sourceOptions: savedSourceOptions,
      formFields: savedFormFields,
      customFields: savedCustomFields,
    });
  } catch (error) {
    console.error("[PUT /api/administration/leads-config]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
