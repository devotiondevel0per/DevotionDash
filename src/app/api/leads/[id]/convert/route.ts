import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";
import { statusForLeadStage, toLeadStageLabel } from "@/lib/leads";

function parseContactName(fullName: string | null | undefined) {
  const raw = (fullName ?? "").trim();
  if (!raw) return { firstName: "Lead", lastName: "Contact" };
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: "Contact" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function priorityToRating(priority: string | null | undefined) {
  const key = (priority ?? "normal").toLowerCase();
  if (key === "high") return "hot";
  if (key === "low") return "weak";
  return "good";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("leads", "manage");
  if (!accessResult.ok) return accessResult.response;

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

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id },
        include: {
          owner: {
            select: {
              id: true,
              fullname: true,
              name: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!lead) {
        return null;
      }

      if (lead.status === "lost" || lead.status === "archived") {
        throw new Error("Cannot convert a lost or archived lead");
      }

      let organizationId = lead.organizationId;
      let organizationCreated = false;

      if (!organizationId) {
        const existingOrg = await tx.organization.findFirst({
          where: {
            name: lead.companyName,
          },
          select: { id: true },
        });

        if (existingOrg) {
          organizationId = existingOrg.id;
        } else {
          const createdOrg = await tx.organization.create({
            data: {
              name: lead.companyName,
              type: lead.stage === "won" ? "client" : "potential",
              status: "open",
              rating: priorityToRating(lead.priority),
              leadSource: lead.source ?? null,
              managerId: lead.ownerId ?? null,
              email: lead.email ?? null,
              phone: lead.phone ?? null,
              country: lead.country ?? null,
              comment: lead.notes ?? null,
            },
            select: {
              id: true,
              name: true,
            },
          });
          organizationId = createdOrg.id;
          organizationCreated = true;

          await tx.orgHistory.create({
            data: {
              organizationId: createdOrg.id,
              userId: accessResult.ctx.userId,
              content: `Created from lead '${lead.title}'.`,
              isSystem: true,
            },
          });
        }
      }

      let contactId = lead.contactId;
      let contactCreated = false;

      if (!contactId && (lead.contactName || lead.email || lead.phone)) {
        let existingContactId: string | null = null;

        if (lead.email && organizationId) {
          const existingByEmail = await tx.contact.findFirst({
            where: {
              organizationId,
              email: lead.email,
            },
            select: { id: true },
          });
          existingContactId = existingByEmail?.id ?? null;
        }

        if (!existingContactId) {
          const contactName = parseContactName(lead.contactName);
          const createdContact = await tx.contact.create({
            data: {
              organizationId: organizationId ?? null,
              createdById: accessResult.ctx.userId,
              firstName: contactName.firstName,
              lastName: contactName.lastName,
              email: lead.email ?? null,
              phone: lead.phone ?? null,
              country: lead.country ?? null,
              note: `Converted from lead '${lead.title}'.`,
            },
            select: { id: true },
          });
          existingContactId = createdContact.id;
          contactCreated = true;
        }

        contactId = existingContactId;
      }

      const targetStage = "won";
      const updatedLead = await tx.lead.update({
        where: { id: lead.id },
        data: {
          organizationId: organizationId ?? null,
          contactId: contactId ?? null,
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
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: accessResult.ctx.userId,
          type: "system",
          content: `Lead converted to organization/contact. Stage set to '${toLeadStageLabel(targetStage)}'.`,
        },
      });

      return {
        lead: updatedLead,
        organizationCreated,
        contactCreated,
      };
    });

    if (!result) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "LEAD_CONVERTED",
      module: "leads",
      targetId: id,
      details: JSON.stringify({
        organizationId: result.lead.organizationId,
        contactId: result.lead.contactId,
        organizationCreated: result.organizationCreated,
        contactCreated: result.contactCreated,
      }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({
      lead: {
        id: result.lead.id,
        title: result.lead.title,
        companyName: result.lead.companyName,
        stage: result.lead.stage,
        status: result.lead.status,
        organizationId: result.lead.organizationId,
        contactId: result.lead.contactId,
      },
      organizationCreated: result.organizationCreated,
      contactCreated: result.contactCreated,
      message: "Lead converted successfully.",
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cannot convert")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[POST /api/leads/[id]/convert]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
