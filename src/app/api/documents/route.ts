import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

type DocumentCategory = "all" | "shared" | "sharedWithMe";

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("documents", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get("folderId");
    const search = searchParams.get("search");
    const categoryParam = searchParams.get("category");
    const category: DocumentCategory =
      categoryParam === "shared" || categoryParam === "sharedWithMe"
        ? categoryParam
        : "all";

    const limit = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);

    const { userId, access } = accessResult.ctx;
    const canManage = access.isAdmin || access.permissions.documents.manage;
    const canModuleRead = canManage || access.permissions.documents.read;

    // Visibility scope: every user (including managers) only sees their own docs,
    // explicitly shared docs, and company-wide ("module") docs.
    // canManage affects write/delete permissions only — not visibility.
    const visibilityOr = [
      { ownerId: userId },
      { shares: { some: { userId } } },
      ...(canModuleRead ? [{ accessLevel: "module" as const }] : []),
    ];

    const folderWhere: Record<string, unknown> = {};
    folderWhere.OR = visibilityOr;
    if (category === "all" && folderId) folderWhere.parentId = folderId;
    if (category === "all" && !folderId) folderWhere.parentId = null; // top-level only
    if (search) folderWhere.name = { contains: search };
    if (category === "shared") {
      folderWhere.ownerId = userId;
      folderWhere.shares = { some: {} };
      if (folderWhere.OR) delete folderWhere.OR;
    }
    if (category === "sharedWithMe") {
      folderWhere.shares = { some: { userId } };
      folderWhere.NOT = { ownerId: userId };
      if (folderWhere.OR) delete folderWhere.OR;
    }

    const documentWhere: Record<string, unknown> = {};
    documentWhere.OR = visibilityOr;
    if (category === "all" && folderId) documentWhere.folderId = folderId;
    if (category === "all" && !folderId) documentWhere.folderId = null; // top-level only
    if (search) documentWhere.name = { contains: search };
    if (category === "shared") {
      documentWhere.ownerId = userId;
      documentWhere.shares = { some: {} };
      if (documentWhere.OR) delete documentWhere.OR;
    }
    if (category === "sharedWithMe") {
      documentWhere.shares = { some: { userId } };
      documentWhere.NOT = { ownerId: userId };
      if (documentWhere.OR) delete documentWhere.OR;
    }

    const [rawFolders, rawDocuments] = await Promise.all([
      prisma.documentFolder.findMany({
        where: folderWhere,
        orderBy: { name: "asc" },
        take: limit,
        include: {
          _count: { select: { children: true, documents: true } },
          owner: { select: { id: true, name: true, fullname: true } },
          shares: {
            select: {
              userId: true,
              canRead: true,
              canWrite: true,
              canDelete: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  fullname: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
      prisma.document.findMany({
        where: documentWhere,
        orderBy: { updatedAt: "desc" },
        take: limit,
        include: {
          owner: { select: { id: true, name: true, fullname: true } },
          folder: { select: { id: true, name: true } },
          shares: {
            select: {
              userId: true,
              canRead: true,
              canWrite: true,
              canDelete: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  fullname: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const folders = rawFolders
      .map((folder) => {
        const currentShare = folder.shares.find((entry) => entry.userId === userId);
        const isOwner = folder.ownerId === userId;
        const sharedRead = Boolean(currentShare?.canRead || currentShare?.canWrite || currentShare?.canDelete);
        const canRead = canManage || isOwner || (folder.accessLevel !== "private" && canModuleRead) || sharedRead;
        const canWrite = canManage || isOwner || Boolean(currentShare?.canWrite);
        const canDelete = canManage || isOwner || Boolean(currentShare?.canDelete);

        const canSeeShareList = canManage || isOwner;
        const sharedWith = canSeeShareList
          ? folder.shares
              .filter((entry) => entry.userId !== folder.ownerId)
              .map((entry) => ({
                userId: entry.userId,
                userName: entry.user.fullname || entry.user.name,
                userEmail: entry.user.email,
                canRead: entry.canRead,
                canWrite: entry.canWrite,
                canDelete: entry.canDelete,
              }))
          : [];

        return {
          ...folder,
          permission: {
            canRead,
            canWrite,
            canDelete,
            isOwner,
            shared: Boolean(currentShare),
          },
          myAccess: { canRead, canWrite, canDelete },
          sharedWith,
          shareCount: sharedWith.length,
          shares: undefined,
        };
      })
      .filter((folder) => folder.permission.canRead);

    const documents = rawDocuments
      .map((doc) => {
        const currentShare = doc.shares.find((entry) => entry.userId === userId);
        const isOwner = doc.ownerId === userId;
        const sharedRead = Boolean(currentShare?.canRead || currentShare?.canWrite || currentShare?.canDelete);

        const canRead = canManage || isOwner || (doc.accessLevel !== "private" && canModuleRead) || sharedRead;
        const canWrite = canManage || isOwner || Boolean(currentShare?.canWrite);
        const canDelete = canManage || isOwner || Boolean(currentShare?.canDelete);

        const canSeeShareList = canManage || isOwner;
        const sharedWith = canSeeShareList
          ? doc.shares
              .filter((entry) => entry.userId !== doc.ownerId)
              .map((entry) => ({
                userId: entry.userId,
                userName: entry.user.fullname || entry.user.name,
                userEmail: entry.user.email,
                canRead: entry.canRead,
                canWrite: entry.canWrite,
                canDelete: entry.canDelete,
              }))
          : [];

        return {
          ...doc,
          permission: {
            canRead,
            canWrite,
            canDelete,
            isOwner,
            shared: Boolean(currentShare),
          },
          myAccess: { canRead, canWrite, canDelete },
          sharedWith,
          shareCount: sharedWith.length,
          shares: undefined,
        };
      })
      .filter((doc) => doc.permission.canRead);

    return NextResponse.json({ folders, documents, category });
  } catch (error) {
    console.error("[GET /api/documents]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("documents", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const { type, name, parentId, folderId, content, fileUrl, fileSize, mimeType, accessLevel } = body as {
      type?: "folder" | "document";
      name?: string;
      parentId?: string | null;
      folderId?: string | null;
      content?: string;
      fileUrl?: string;
      fileSize?: number;
      mimeType?: string;
      accessLevel?: "module" | "private";
    };

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (type === "folder") {
      const folder = await prisma.documentFolder.create({
        data: {
          name: name.trim(),
          parentId: parentId ?? null,
          ownerId: accessResult.ctx.userId,
          accessLevel: accessLevel === "module" ? "module" : "private",
        },
        include: {
          _count: { select: { children: true, documents: true } },
        },
      });
      return NextResponse.json({ type: "folder", folder }, { status: 201 });
    }

    const document = await prisma.document.create({
      data: {
        name: name.trim(),
        folderId: folderId ?? null,
        content: content ?? null,
        fileUrl: fileUrl ?? null,
        fileSize: fileSize ?? null,
        mimeType: mimeType ?? null,
        accessLevel: accessLevel === "module" ? "module" : "private",
        ownerId: accessResult.ctx.userId,
      },
      include: {
        owner: { select: { id: true, name: true, fullname: true } },
        folder: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ type: "document", document }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/documents]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
