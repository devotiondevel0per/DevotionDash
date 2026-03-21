import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("team", "read");
  if (!accessResult.ok) return accessResult.response;
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? undefined;
  const department = searchParams.get("department") ?? undefined;
  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        ...(department && { department }),
        ...(search && {
          OR: [
            { name: { contains: search } },
            { surname: { contains: search } },
            { fullname: { contains: search } },
            { email: { contains: search } },
            { position: { contains: search } },
          ],
        }),
      },
      select: {
        id: true,
        name: true,
        surname: true,
        fullname: true,
        email: true,
        position: true,
        department: true,
        photoUrl: true,
        phoneWork: true,
        phoneMobile: true,
        dateBirthday: true,
        lastActivity: true,
        workState: true,
        isAdmin: true,
      },
      orderBy: [{ department: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(users);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
