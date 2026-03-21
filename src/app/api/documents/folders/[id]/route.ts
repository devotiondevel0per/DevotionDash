import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

function resolveFolderAccess(args: {
  ownerId: string | null;
  userId: string;
  isAdmin: boolean;
  canManage: boolean;
  shareCanWrite: boolean;
  shareCanDelete: boolean;
}) {
  const isOwner = Boolean(args.ownerId && args.ownerId === args.userId);
  const canWrite = args.isAdmin || isOwner || args.shareCanWrite || args.canManage;
  // Delete requires explicit share permission — canManage does NOT grant delete on others' folders
  const canDelete = args.isAdmin || isOwner || args.shareCanDelete;
  return { canWrite, canDelete };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("documents", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  try {
    const { name } = await req.json() as { name?: string };
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const folder = await prisma.documentFolder.findUnique({
      where: { id },
      include: {
        shares: {
          where: { userId: accessResult.ctx.userId },
          select: { canWrite: true, canDelete: true },
          take: 1,
        },
      },
    });

    if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const access = resolveFolderAccess({
      ownerId: folder.ownerId,
      userId: accessResult.ctx.userId,
      isAdmin: accessResult.ctx.access.isAdmin,
      canManage: accessResult.ctx.access.permissions.documents.manage,
      shareCanWrite: Boolean(folder.shares[0]?.canWrite),
      shareCanDelete: Boolean(folder.shares[0]?.canDelete),
    });

    if (!access.canWrite) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.documentFolder.update({
      where: { id },
      data: { name: name.trim() },
      include: { _count: { select: { children: true, documents: true } } },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PUT /api/documents/folders/[id]]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("documents", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  try {
    const folder = await prisma.documentFolder.findUnique({
      where: { id },
      include: {
        _count: { select: { children: true, documents: true } },
        shares: {
          where: { userId: accessResult.ctx.userId },
          select: { canWrite: true, canDelete: true },
          take: 1,
        },
      },
    });

    if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const access = resolveFolderAccess({
      ownerId: folder.ownerId,
      userId: accessResult.ctx.userId,
      isAdmin: accessResult.ctx.access.isAdmin,
      canManage: accessResult.ctx.access.permissions.documents.manage,
      shareCanWrite: Boolean(folder.shares[0]?.canWrite),
      shareCanDelete: Boolean(folder.shares[0]?.canDelete),
    });

    if (!access.canDelete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (folder._count.children > 0 || folder._count.documents > 0) {
      return NextResponse.json(
        { error: "Folder is not empty. Remove all contents first." },
        { status: 409 }
      );
    }

    await prisma.documentFolder.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/documents/folders/[id]]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
