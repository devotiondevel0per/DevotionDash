import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { jwtVerify } from "jose";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function resolveUserId(): Promise<string | null> {
  try {
    const session = await auth();
    if (session?.user?.id) return session.user.id;
  } catch { /* no session */ }
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

// POST /api/notifications/device-token — register FCM token
export async function POST(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { token?: string; platform?: string };
  const { token, platform = "android" } = body;
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  await prisma.deviceToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/notifications/device-token — unregister on logout
export async function DELETE(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = (await req.json()) as { token?: string };
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  await prisma.deviceToken.deleteMany({ where: { token, userId } });
  return NextResponse.json({ ok: true });
}
