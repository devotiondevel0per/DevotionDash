import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

async function resolveUserId(): Promise<string | null> {
  try {
    const session = await auth();
    if (session?.user?.id) return session.user.id;
  } catch { /* no session cookie — mobile request */ }

  const headersList = await headers();
  const authHeader = headersList.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "fallback-secret");
      const { payload } = await jwtVerify(authHeader.slice(7), secret);
      if (typeof payload.sub === "string") return payload.sub;
    } catch { return null; }
  }
  return null;
}

export async function GET(_req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      surname: true,
      fullname: true,
      email: true,
      photoUrl: true,
      position: true,
      department: true,
      phoneWork: true,
      phoneMobile: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PUT(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json()) as { name?: string; surname?: string; photoUrl?: string; position?: string };
  const data: Record<string, string> = {};
  if (body.name !== undefined) data.name = body.name.trim().slice(0, 100);
  if (body.surname !== undefined) data.surname = body.surname.trim().slice(0, 100);
  if (body.photoUrl !== undefined) data.photoUrl = body.photoUrl.slice(0, 500);
  if (body.position !== undefined) data.position = body.position.trim().slice(0, 200);
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  if (data.name !== undefined || data.surname !== undefined) {
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, surname: true } });
    const newName = data.name ?? current?.name ?? "";
    const newSurname = data.surname ?? current?.surname ?? "";
    data.fullname = [newName, newSurname].filter(Boolean).join(" ").trim();
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, surname: true, fullname: true, email: true, photoUrl: true, position: true },
  });
  return NextResponse.json(updated);
}
