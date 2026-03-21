import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("documents", "read");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  const { userId, access } = accessResult.ctx;

  try {
    const folder = await prisma.documentFolder.findUnique({
      where: { id },
      include: {
        shares: {
          include: {
            user: { select: { id: true, name: true, fullname: true, email: true } },
          },
        },
      },
    });

    if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const currentShare = folder.shares.find((entry) => entry.userId === userId);
    const canViewShares = access.isAdmin
      || access.permissions.documents.manage
      || folder.ownerId === userId
      || Boolean(currentShare?.canWrite);

    if (!canViewShares) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      id: folder.id,
      accessLevel: folder.accessLevel,
      shares: folder.shares
        .filter((entry) => entry.userId !== folder.ownerId)
        .map((entry) => ({
          userId: entry.userId,
          userName: entry.user.fullname || entry.user.name,
          userEmail: entry.user.email,
          canRead: entry.canRead,
          canWrite: entry.canWrite,
          canDelete: entry.canDelete,
        })),
    });
  } catch (error) {
    console.error("[GET /api/documents/folders/[id]/share]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("documents", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  const { userId, access } = accessResult.ctx;

  try {
    const body = await req.json() as {
      accessLevel?: "module" | "private";
      shares?: Array<{
        userId: string;
        canRead?: boolean;
        canWrite?: boolean;
        canDelete?: boolean;
      }>;
    };

    const folder = await prisma.documentFolder.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        ownerId: true,
        accessLevel: true,
        shares: {
          select: {
            userId: true,
            canRead: true,
            canWrite: true,
            canDelete: true,
          },
        },
      },
    });

    if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const canManageShares = access.isAdmin || access.permissions.documents.manage || folder.ownerId === userId;
    if (!canManageShares) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const normalizedShares = (body.shares ?? [])
      .map((entry) => ({
        userId: String(entry.userId || "").trim(),
        canRead: Boolean(entry.canRead),
        canWrite: Boolean(entry.canWrite),
        canDelete: Boolean(entry.canDelete),
      }))
      .filter((entry) => entry.userId && entry.userId !== folder.ownerId)
      .filter((entry) => entry.canRead || entry.canWrite || entry.canDelete);

    const uniqueShareMap = new Map<string, { userId: string; canRead: boolean; canWrite: boolean; canDelete: boolean }>();
    for (const entry of normalizedShares) {
      uniqueShareMap.set(entry.userId, entry);
    }

    const uniqueShares = Array.from(uniqueShareMap.values());

    const previousShareMap = new Map(folder.shares.map((entry) => [entry.userId, entry]));
    const nextShareMap = new Map(uniqueShares.map((entry) => [entry.userId, entry]));

    const addedUsers: string[] = [];
    const removedUsers: string[] = [];
    const updatedUsers: string[] = [];

    for (const userIdKey of nextShareMap.keys()) {
      if (!previousShareMap.has(userIdKey)) {
        addedUsers.push(userIdKey);
        continue;
      }
      const prev = previousShareMap.get(userIdKey)!;
      const next = nextShareMap.get(userIdKey)!;
      if (prev.canRead !== next.canRead || prev.canWrite !== next.canWrite || prev.canDelete !== next.canDelete) {
        updatedUsers.push(userIdKey);
      }
    }

    for (const userIdKey of previousShareMap.keys()) {
      if (!nextShareMap.has(userIdKey)) {
        removedUsers.push(userIdKey);
      }
    }

    const nextAccessLevel = body.accessLevel === "module" ? "module" : "private";

    await prisma.$transaction(async (tx) => {
      await tx.documentFolder.update({
        where: { id: folder.id },
        data: { accessLevel: nextAccessLevel },
      });

      await tx.documentFolderShare.deleteMany({ where: { folderId: folder.id } });

      if (uniqueShares.length > 0) {
        await tx.documentFolderShare.createMany({
          data: uniqueShares.map((entry) => ({
            folderId: folder.id,
            userId: entry.userId,
            canRead: entry.canRead,
            canWrite: entry.canWrite,
            canDelete: entry.canDelete,
          })),
          skipDuplicates: true,
        });
      }
    });

    await writeAuditLog({
      userId,
      action: "share_update",
      module: "documents",
      targetId: folder.id,
      details: JSON.stringify({
        scope: "folder",
        folderName: folder.name,
        accessLevelBefore: folder.accessLevel,
        accessLevelAfter: nextAccessLevel,
        addedUsers,
        removedUsers,
        updatedUsers,
        totalShares: uniqueShares.length,
      }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PUT /api/documents/folders/[id]/share]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
