import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  getNextLeadStage,
  isTerminalLeadStage,
  loadLeadStageFlow,
  normalizeLeadStage,
  statusForLeadStage,
  toLeadStageLabel,
} from "@/lib/leads";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("leads", "write");
  if (!accessResult.ok) return accessResult.response;

  // Terminal stage transitions (won/lost/archived) require manage permission
  const bodyPeek = (await req.clone().json().catch(() => ({}))) as { action?: string; stage?: string };
  const targetIsTerminal = bodyPeek.action === "set" && ["won", "lost", "archived"].includes(bodyPeek.stage ?? "");
  if (targetIsTerminal && !accessResult.ctx.access.permissions.leads?.manage) {
    return NextResponse.json({ error: "Moving a lead to Won/Lost/Archived requires manager permission" }, { status: 403 });
  }

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Lead id is required" }, { status: 400 });
    }

    const scopedLead = await prisma.lead.findFirst({
      where: accessResult.ctx.access.isAdmin
        ? { id }
        : { id, ownerId: accessResult.ctx.userId },
      select: { id: true },
    });
    if (!scopedLead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: "complete" | "set";
      stage?: string;
      note?: string;
    };

    const action = body.action ?? "complete";
    if (action !== "complete" && action !== "set") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const stageFlow = await loadLeadStageFlow();
    const allowedStages = new Set([...stageFlow, "lost", "archived"]);

    const transition = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              fullname: true,
            },
          },
        },
      });

      if (!lead) return null;

      const previousStage = normalizeLeadStage(lead.stage);
      let targetStage = previousStage;
      let reason = "manual";

      if (action === "complete") {
        const next = getNextLeadStage(previousStage, stageFlow);
        if (next) {
          targetStage = next;
          reason = "auto_next";
        }
      }

      if (action === "set") {
        const requested = normalizeLeadStage(body.stage);
        if (!allowedStages.has(requested)) {
          throw new Error(`Invalid stage. Allowed stages: ${Array.from(allowedStages).join(", ")}`);
        }
        targetStage = requested;
      }

      const changed = targetStage !== previousStage;
      const updated = changed
        ? await tx.lead.update({
            where: { id },
            data: {
              stage: targetStage,
              status: statusForLeadStage(targetStage),
            },
            include: {
              owner: {
                select: {
                  id: true,
                  name: true,
                  fullname: true,
                },
              },
            },
          })
        : lead;

      if (changed) {
        const transitionText =
          reason === "auto_next"
            ? `Stage auto-advanced from '${toLeadStageLabel(previousStage)}' to '${toLeadStageLabel(targetStage)}' after completion.`
            : `Stage changed from '${toLeadStageLabel(previousStage)}' to '${toLeadStageLabel(targetStage)}'.`;

        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            userId: accessResult.ctx.userId,
            type: "stage_change",
            content: transitionText,
          },
        });
      }

      const note = body.note?.trim();
      if (note) {
        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            userId: accessResult.ctx.userId,
            type: "note",
            content: note,
          },
        });
      }

      return {
        changed,
        reason,
        lead: updated,
        previousStage,
        targetStage,
      };
    });

    if (!transition) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const nextStage = getNextLeadStage(transition.targetStage, stageFlow);
    const isFinal = isTerminalLeadStage(transition.targetStage) || !nextStage;

    return NextResponse.json({
      changed: transition.changed,
      reason: transition.reason,
      isFinal,
      nextStage,
      lead: {
        id: transition.lead.id,
        title: transition.lead.title,
        companyName: transition.lead.companyName,
        stage: transition.lead.stage,
        stageLabel: toLeadStageLabel(transition.lead.stage),
        status: transition.lead.status,
        updatedAt: transition.lead.updatedAt.toISOString(),
        owner: transition.lead.owner,
      },
      message:
        transition.changed
          ? `Lead moved to '${toLeadStageLabel(transition.targetStage)}'.`
          : "Lead is already at the final stage.",
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid stage")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[PATCH /api/leads/[id]/stage]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
