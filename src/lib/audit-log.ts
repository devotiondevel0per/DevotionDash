import { prisma } from "@/lib/prisma";

type AuditLogInput = {
  userId?: string | null;
  action: string;
  module: string;
  targetId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
};

export async function writeAuditLog(input: AuditLogInput) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        module: input.module,
        targetId: input.targetId ?? null,
        details: input.details ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (error) {
    // Audit logging should never break business actions.
    console.error("[writeAuditLog]", error);
  }
}

export function getClientIpAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip") ?? null;
}

