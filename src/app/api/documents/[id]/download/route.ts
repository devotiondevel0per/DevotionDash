import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
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

  if (isAdmin || isOwner) return true;

  if (level === "read") {
    return (accessLevel !== "private" && canModuleRead) || shareCanRead || shareCanWrite || shareCanDelete || canManage;
  }

  if (level === "write") {
    return shareCanWrite || canManage;
  }

  return shareCanDelete;
}

export async function GET(
  _req: Request,
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
        shares: {
          where: { userId },
          select: { canRead: true, canWrite: true, canDelete: true },
          take: 1,
        },
      },
    });

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

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

    if (!canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!doc.fileUrl || !doc.fileUrl.startsWith("/uploads/")) {
      return NextResponse.json({ error: "File not available" }, { status: 404 });
    }

    const publicRoot = path.resolve(process.cwd(), "public");
    const relativePath = doc.fileUrl.replace(/^\/+/, "");
    const filePath = path.resolve(publicRoot, relativePath);

    if (!filePath.startsWith(publicRoot)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Length": String(fileBuffer.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[GET /api/documents/[id]/download]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
