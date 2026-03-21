import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET() {
  const accessResult = await requireModuleAccess("documents", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { userId, access } = accessResult.ctx;
    const canManage = access.isAdmin || access.permissions.documents.manage;
    const canModuleRead = canManage || access.permissions.documents.read;

    const visibilityWhere = {
      OR: [
        { ownerId: userId },
        { shares: { some: { userId } } },
        ...(canModuleRead ? [{ accessLevel: "module" as const }] : []),
      ],
    };

    const folders = await prisma.documentFolder.findMany({
      where: visibilityWhere,
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            children: true,
            documents: true,
          },
        },
        shares: {
          where: { userId },
          select: { canRead: true, canWrite: true, canDelete: true },
          take: 1,
        },
      },
    });

    const visible = folders.filter((folder) => {
      const currentShare = folder.shares[0];
      const isOwner = folder.ownerId === userId;
      const sharedRead = Boolean(currentShare?.canRead || currentShare?.canWrite || currentShare?.canDelete);
      return isOwner || (folder.accessLevel !== "private" && canModuleRead) || sharedRead;
    });

    return NextResponse.json(
      visible.map((folder) => ({
        ...folder,
        shares: undefined,
      }))
    );
  } catch (error) {
    console.error("[GET /api/documents/folders]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
