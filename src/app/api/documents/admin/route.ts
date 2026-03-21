import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

// Admin endpoint: view all documents user-wise or all-in-one
export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("documents", "manage");
  if (!accessResult.ok) return accessResult.response;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId"); // filter by specific user
  const view = searchParams.get("view") ?? "all"; // "all" | "by_user"
  const search = searchParams.get("search");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 1000);

  try {
    if (view === "by_user") {
      // Group documents by owner
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          fullname: true,
          email: true,
          photoUrl: true,
          department: true,
          _count: { select: { documents: true, documentFoldersOwned: true } },
        },
        orderBy: { fullname: "asc" },
      });

      // If a specific userId is provided, also return their documents
      if (userId) {
        const [documents, folders] = await Promise.all([
          prisma.document.findMany({
            where: {
              ownerId: userId,
              ...(search ? { name: { contains: search } } : {}),
            },
            take: limit,
            orderBy: { updatedAt: "desc" },
            include: {
              folder: { select: { id: true, name: true } },
            },
          }),
          prisma.documentFolder.findMany({
            where: {
              ownerId: userId,
              ...(search ? { name: { contains: search } } : {}),
            },
            take: 200,
            orderBy: { name: "asc" },
          }),
        ]);

        return NextResponse.json({ view: "user_detail", users, userId, documents, folders });
      }

      return NextResponse.json({ view: "by_user", users });
    }

    // view === "all" — return all documents with owner info
    const [documents, folders] = await Promise.all([
      prisma.document.findMany({
        where: {
          ...(userId ? { ownerId: userId } : {}),
          ...(search ? { name: { contains: search } } : {}),
        },
        take: limit,
        orderBy: { updatedAt: "desc" },
        include: {
          folder: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true, fullname: true, email: true, photoUrl: true } },
        },
      }),
      prisma.documentFolder.findMany({
        where: {
          ...(userId ? { ownerId: userId } : {}),
          parentId: null, // top-level folders only
          ...(search ? { name: { contains: search } } : {}),
        },
        take: 500,
        orderBy: { name: "asc" },
        include: {
          owner: { select: { id: true, name: true, fullname: true, email: true } },
          _count: { select: { children: true, documents: true } },
        },
      }),
    ]);

    return NextResponse.json({
      view: "all",
      documents: documents.map((d) => ({
        id: d.id,
        name: d.name,
        mimeType: d.mimeType,
        fileSize: d.fileSize,
        accessLevel: d.accessLevel,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        folder: d.folder ?? null,
        owner: d.owner,
      })),
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        accessLevel: f.accessLevel,
        createdAt: f.createdAt,
        documentCount: f._count.documents,
        childCount: f._count.children,
        owner: f.owner,
      })),
    });
  } catch (error) {
    console.error("[GET /api/documents/admin]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
