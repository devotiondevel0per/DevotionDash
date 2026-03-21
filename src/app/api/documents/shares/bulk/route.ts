import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("documents", "write");
  if (!accessResult.ok) return accessResult.response;

  const { userId, access } = accessResult.ctx;

  try {
    const body = await req.json() as {
      documentIds?: string[];
      action?: "share" | "unshare";
      targetUserId?: string;
      canRead?: boolean;
      canWrite?: boolean;
      canDelete?: boolean;
      accessLevel?: "module" | "private";
    };

    const documentIds = Array.isArray(body.documentIds)
      ? Array.from(new Set(body.documentIds.map((id) => String(id).trim()).filter(Boolean)))
      : [];

    if (documentIds.length === 0) {
      return NextResponse.json({ error: "documentIds is required" }, { status: 400 });
    }

    if (body.action !== "share" && body.action !== "unshare") {
      return NextResponse.json({ error: "action must be 'share' or 'unshare'" }, { status: 400 });
    }

    const targetUserId = String(body.targetUserId ?? "").trim();
    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
    }

    const docs = await prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, name: true, ownerId: true },
    });

    const canManage = access.isAdmin || access.permissions.documents.manage;

    const allowed = docs.filter((doc) => canManage || doc.ownerId === userId);
    const denied = docs.filter((doc) => !(canManage || doc.ownerId === userId));

    if (allowed.length === 0) {
      return NextResponse.json({
        ok: false,
        updated: 0,
        denied: denied.length,
        message: "No selected documents can be shared by current user",
      }, { status: 403 });
    }

    const canRead = body.action === "share" ? Boolean(body.canRead || body.canWrite || body.canDelete) : false;
    const canWrite = body.action === "share" ? Boolean(body.canWrite) : false;
    const canDelete = body.action === "share" ? Boolean(body.canDelete) : false;
    const setAccessLevel = body.accessLevel === "private" || body.accessLevel === "module"
      ? body.accessLevel
      : null;

    let updated = 0;

    await prisma.$transaction(async (tx) => {
      if (setAccessLevel) {
        await tx.document.updateMany({
          where: { id: { in: allowed.map((doc) => doc.id) } },
          data: { accessLevel: setAccessLevel },
        });
      }

      if (body.action === "share") {
        for (const doc of allowed) {
          if (doc.ownerId === targetUserId) continue;
          await tx.documentShare.upsert({
            where: {
              documentId_userId: {
                documentId: doc.id,
                userId: targetUserId,
              },
            },
            create: {
              documentId: doc.id,
              userId: targetUserId,
              canRead,
              canWrite,
              canDelete,
            },
            update: {
              canRead,
              canWrite,
              canDelete,
            },
          });
          updated += 1;
        }
      } else {
        const result = await tx.documentShare.deleteMany({
          where: {
            documentId: { in: allowed.map((doc) => doc.id) },
            userId: targetUserId,
          },
        });
        updated = result.count;
      }
    });

    await writeAuditLog({
      userId,
      action: body.action === "share" ? "bulk_share" : "bulk_unshare",
      module: "documents",
      targetId: targetUserId,
      details: JSON.stringify({
        targetUserId,
        documentCount: allowed.length,
        updated,
        denied: denied.length,
        rights: body.action === "share" ? { canRead, canWrite, canDelete } : null,
        accessLevel: setAccessLevel,
      }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({
      ok: true,
      updated,
      processed: allowed.length,
      denied: denied.length,
      action: body.action,
    });
  } catch (error) {
    console.error("[POST /api/documents/shares/bulk]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
