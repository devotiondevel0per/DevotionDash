# deploy-mobile-auth.ps1
# Run this on the production server (209.192.167.118) as Administrator
# It patches 2 files that enable mobile Bearer-token auth, then rebuilds.

$AppRoot = "C:\DevotionDash\DevotionDash"

# ── 1. src\lib\api-access.ts ──────────────────────────────────────────────────
$apiAccess = @'
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { jwtVerify } from "jose";
import { assertModuleAccess, buildUserAccess, type UserAccess } from "@/lib/rbac";
import { type ModuleId, type PermissionAction } from "@/lib/permissions";
import { getDb } from "@/lib/get-db";
import { prisma } from "@/lib/prisma";
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

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });

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
'@

# ── 2. src\proxy.ts ───────────────────────────────────────────────────────────
$proxy = @'
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { evaluateNetworkAccess, getRequestCountry, getRequestIp, getSecurityPolicy } from "@/lib/security-policy";
import { getTenantByDomain, isPlatformDomain } from "@/lib/tenant-registry";

async function isMobileTokenValid(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "fallback-secret");
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export default auth(async (req) => {
  const sessionLoggedIn = !!req.auth;
  const mobileLoggedIn = await isMobileTokenValid(req);
  const isLoggedIn = sessionLoggedIn || mobileLoggedIn;
  const pathname = req.nextUrl.pathname;
  const isLoginPage = pathname === "/login";
  const isForgotPasswordPage = pathname === "/forgot-password";
  const isResetPasswordPage = pathname === "/reset-password";
  const isPublicAuthPage = isLoginPage || isForgotPasswordPage || isResetPasswordPage;
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isApiPublic = req.nextUrl.pathname.startsWith("/api/public/");
  const isApiRoute = req.nextUrl.pathname.startsWith("/api");
  const isPublic = req.nextUrl.pathname.startsWith("/chat/widget") || req.nextUrl.pathname.startsWith("/support/widget");

  // ── Tenant domain resolution ─────────────────────────────────────────
  const host = req.headers.get("host") ?? "";
  let tenantId: string | null = null;

  if (!isPlatformDomain(host)) {
    try {
      const tenant = await getTenantByDomain(host);
      if (!tenant) {
        if (!host.includes("localhost") && !host.includes("127.0.0.1")) {
          return new NextResponse("Domain not configured", { status: 404 });
        }
      } else if (tenant.status === "suspended") {
        return new NextResponse(
          "This account has been suspended. Please contact support.",
          { status: 403 }
        );
      } else if (tenant.status === "cancelled") {
        return new NextResponse("This account has been cancelled.", { status: 410 });
      } else {
        tenantId = tenant.id;
      }
    } catch {
      // Registry DB unavailable — allow through to avoid hard lockout
    }
  }

  if (process.env.FORCE_HTTPS === "true") {
    const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
    if (proto === "http") {
      const httpsUrl = req.nextUrl.clone();
      httpsUrl.protocol = "https:";
      return NextResponse.redirect(httpsUrl, { status: 301 });
    }
  }

  if (isApiAuth || isApiPublic || isPublic) {
    const response = NextResponse.next();
    if (tenantId) response.headers.set("x-tenant-id", tenantId);
    return response;
  }

  const policy = await getSecurityPolicy();
  const ip = getRequestIp(req.headers);
  const country = getRequestCountry(req.headers);
  const networkCheck = evaluateNetworkAccess(policy, { ip, country });
  if (!networkCheck.allowed) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Blocked by security policy" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (!isLoggedIn && isApiRoute) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isLoggedIn && !isPublicAuthPage) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isLoggedIn && isPublicAuthPage) {
    return NextResponse.redirect(new URL("/home", req.nextUrl));
  }

  if (isLoggedIn) {
    const authAt = Number((req.auth?.user as { authAt?: number } | undefined)?.authAt ?? 0);
    if (Number.isFinite(authAt) && authAt > 0) {
      const sessionAgeMs = Date.now() - authAt;
      if (sessionAgeMs > policy.sessionMaxMinutes * 60 * 1000) {
        if (isApiRoute) {
          return NextResponse.json({ error: "Session expired" }, { status: 401 });
        }
        return NextResponse.redirect(new URL("/login", req.nextUrl));
      }
    }
  }

  const response = NextResponse.next();
  if (tenantId) response.headers.set("x-tenant-id", tenantId);
  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|res|uploads).*)"],
};
'@

# ── Write files ───────────────────────────────────────────────────────────────
Write-Host "Writing api-access.ts..." -ForegroundColor Cyan
$apiAccess | Set-Content -Encoding UTF8 -Path "$AppRoot\src\lib\api-access.ts"

Write-Host "Writing proxy.ts..." -ForegroundColor Cyan
$proxy | Set-Content -Encoding UTF8 -Path "$AppRoot\src\proxy.ts"

# ── Rebuild & restart ─────────────────────────────────────────────────────────
Write-Host "Building..." -ForegroundColor Cyan
Set-Location $AppRoot
npm run build

Write-Host "Restarting PM2..." -ForegroundColor Cyan
pm2 restart devotiondash

Write-Host "Done! Mobile Bearer auth is now active." -ForegroundColor Green
