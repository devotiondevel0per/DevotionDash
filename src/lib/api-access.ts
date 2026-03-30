import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { jwtVerify } from "jose";
import { assertModuleAccess, buildUserAccess, type UserAccess } from "@/lib/rbac";
import { type ModuleId, type PermissionAction } from "@/lib/permissions";
import { getDb } from "@/lib/get-db";
import type { PrismaClient } from "@prisma/client";

export interface AccessContext {
  userId: string;
  userEmail: string | null;
  access: UserAccess;
  /** The correct DB client for this request (platform or tenant). Use this for all data queries. */
  db: PrismaClient;
}

async function resolveUserId(): Promise<string | null> {
  // 1. Try NextAuth session (web)
  const session = await auth();
  if (session?.user?.id) return session.user.id;

  // 2. Try Bearer token (mobile)
  const headersList = await headers();
  const authHeader = headersList.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "fallback-secret");
      const { payload } = await jwtVerify(token, secret);
      if (typeof payload.sub === "string") return payload.sub;
    } catch {
      return null;
    }
  }

  return null;
}

export async function requireModuleAccess(
  moduleId: ModuleId,
  action: PermissionAction = "read"
): Promise<{ ok: true; ctx: AccessContext } | { ok: false; response: NextResponse }> {
  const userId = await resolveUserId();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const db = await getDb();
  const access = await buildUserAccess(userId, db);
  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!assertModuleAccess(access, moduleId, action)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Forbidden: missing ${moduleId}.${action} permission` },
        { status: 403 }
      ),
    };
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });

  return {
    ok: true,
    ctx: {
      userId,
      userEmail: user?.email ?? null,
      access,
      db,
    },
  };
}
