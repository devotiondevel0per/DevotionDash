import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const accessResult = await requireModuleAccess("documents", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { userId } = accessResult.ctx;

    const [sharedDocs, sharedFolders, sharedWithMeDocs, sharedWithMeFolders] = await Promise.all([
      prisma.document.count({
        where: {
          ownerId: userId,
          shares: { some: {} },
        },
      }),
      prisma.documentFolder.count({
        where: {
          ownerId: userId,
          shares: { some: {} },
        },
      }),
      prisma.document.count({
        where: {
          NOT: { ownerId: userId },
          shares: { some: { userId } },
        },
      }),
      prisma.documentFolder.count({
        where: {
          NOT: { ownerId: userId },
          shares: { some: { userId } },
        },
      }),
    ]);

    return NextResponse.json({
      shared: sharedDocs + sharedFolders,
      sharedWithMe: sharedWithMeDocs + sharedWithMeFolders,
      breakdown: {
        shared: { documents: sharedDocs, folders: sharedFolders },
        sharedWithMe: { documents: sharedWithMeDocs, folders: sharedWithMeFolders },
      },
    });
  } catch (error) {
    console.error("[GET /api/documents/counts]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
