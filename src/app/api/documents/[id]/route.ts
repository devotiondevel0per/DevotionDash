import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

type AccessLevel = "read" | "write" | "delete";

function canAccessDocument(args: {
  level: AccessLevel;
  isOwner: boolean;
  isAdmin: boolean;
  canManage: boolean;
  canModuleRead: boolean;
  shareCanRead: boolean;
  shareCanWrite: boolean;
  shareCanDelete: boolean;
  accessLevel: string;
}) {
  const {
    level,
    isOwner,
    isAdmin,
    canManage,
    canModuleRead,
    shareCanRead,
    shareCanWrite,
    shareCanDelete,
    accessLevel,
  } = args;

  // Owners and admins always have full access
  if (isAdmin || isOwner) return true;

  if (level === "read") {
    return (accessLevel !== "private" && canModuleRead) || shareCanRead || shareCanWrite || shareCanDelete || canManage;
  }

  if (level === "write") {
    return shareCanWrite || canManage;
  }

  // Delete requires explicit share permission — canManage does NOT grant delete on others' docs
  return shareCanDelete;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("documents", "read");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  const { userId, access } = accessResult.ctx;

  try {
    const doc = await prisma.document.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, fullname: true } },
        folder: { select: { id: true, name: true } },
        shares: {
          where: { userId },
          select: { canRead: true, canWrite: true, canDelete: true },
          take: 1,
        },
      },
    });

    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const share = doc.shares[0];
    const canRead = canAccessDocument({
      level: "read",
      isOwner: doc.ownerId === userId,
      isAdmin: access.isAdmin,
      canManage: access.permissions.documents.manage,
      canModuleRead: access.permissions.documents.read,
      shareCanRead: Boolean(share?.canRead),
      shareCanWrite: Boolean(share?.canWrite),
      shareCanDelete: Boolean(share?.canDelete),
      accessLevel: doc.accessLevel,
    });

    if (!canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    return NextResponse.json({
      ...doc,
      shares: undefined,
      permission: {
        canRead,
        canWrite: canAccessDocument({
          level: "write",
          isOwner: doc.ownerId === userId,
          isAdmin: access.isAdmin,
          canManage: access.permissions.documents.manage,
          canModuleRead: access.permissions.documents.read,
          shareCanRead: Boolean(share?.canRead),
          shareCanWrite: Boolean(share?.canWrite),
          shareCanDelete: Boolean(share?.canDelete),
          accessLevel: doc.accessLevel,
        }),
        canDelete: canAccessDocument({
          level: "delete",
          isOwner: doc.ownerId === userId,
          isAdmin: access.isAdmin,
          canManage: access.permissions.documents.manage,
          canModuleRead: access.permissions.documents.read,
          shareCanRead: Boolean(share?.canRead),
          shareCanWrite: Boolean(share?.canWrite),
          shareCanDelete: Boolean(share?.canDelete),
          accessLevel: doc.accessLevel,
        }),
      },
    });
  } catch (error) {
    console.error("[GET /api/documents/[id]]", error);
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
    const { name, content, folderId, accessLevel } = await req.json() as {
      name?: string;
      content?: string;
      folderId?: string | null;
      accessLevel?: "module" | "private";
    };

    const doc = await prisma.document.findUnique({
      where: { id },
      include: {
        shares: {
          where: { userId },
          select: { canRead: true, canWrite: true, canDelete: true },
          take: 1,
        },
      },
    });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const share = doc.shares[0];
    const canEdit = canAccessDocument({
      level: "write",
      isOwner: doc.ownerId === userId,
      isAdmin: access.isAdmin,
      canManage: access.permissions.documents.manage,
      canModuleRead: access.permissions.documents.read,
      shareCanRead: Boolean(share?.canRead),
      shareCanWrite: Boolean(share?.canWrite),
      shareCanDelete: Boolean(share?.canDelete),
      accessLevel: doc.accessLevel,
    });

    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.document.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(content !== undefined && { content }),
        ...(folderId !== undefined && { folderId }),
        ...((accessLevel === "module" || accessLevel === "private") && { accessLevel }),
      },
      include: {
        owner: { select: { id: true, name: true, fullname: true } },
        folder: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PUT /api/documents/[id]]", error);
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
  const { userId, access } = accessResult.ctx;

  try {
    const doc = await prisma.document.findUnique({
      where: { id },
      include: {
        shares: {
          where: { userId },
          select: { canRead: true, canWrite: true, canDelete: true },
          take: 1,
        },
      },
    });

    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const share = doc.shares[0];
    const canDelete = canAccessDocument({
      level: "delete",
      isOwner: doc.ownerId === userId,
      isAdmin: access.isAdmin,
      canManage: access.permissions.documents.manage,
      canModuleRead: access.permissions.documents.read,
      shareCanRead: Boolean(share?.canRead),
      shareCanWrite: Boolean(share?.canWrite),
      shareCanDelete: Boolean(share?.canDelete),
      accessLevel: doc.accessLevel,
    });

    if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.document.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/documents/[id]]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
