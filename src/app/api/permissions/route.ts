import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { jwtVerify } from "jose";
import { auth } from "@/auth";
import { buildUserAccess } from "@/lib/rbac";

async function resolveUserId(): Promise<string | null> {
  // 1. NextAuth session (web browser)
  try {
    const session = await auth();
    if (session?.user?.id) return session.user.id;
  } catch { /* ignore — mobile requests have no session cookie */ }

  // 2. Bearer JWT (mobile app)
  const headersList = await headers();
  const authHeader = headersList.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      const secret = new TextEncoder().encode(
        process.env.AUTH_SECRET ?? "fallback-secret"
      );
      const { payload } = await jwtVerify(authHeader.slice(7), secret);
      if (typeof payload.sub === "string") return payload.sub;
    } catch {
      return null;
    }
  }
  return null;
}

export async function GET() {
  const userId = await resolveUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const access = await buildUserAccess(userId);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(access);
  } catch (error) {
    console.error("[GET /api/permissions]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
