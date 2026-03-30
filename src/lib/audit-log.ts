import { prisma } from "@/lib/prisma";
import { getDb } from "@/lib/get-db";
import type { PrismaClient } from "@prisma/client";

type AuditLogInput = {
  userId?: string | null;
  action: string;
  module: string;
  targetId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  db?: PrismaClient;
};

export async function writeAuditLog(input: AuditLogInput) {
  try {
    const db = input.db ?? (await getDb().catch(() => prisma));
    await db.auditLog.create({
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
