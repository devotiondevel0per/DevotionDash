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
    // This request is for a tenant domain — resolve tenant
    try {
      const tenant = await getTenantByDomain(host);
      if (!tenant) {
        // Unknown domain — return 404 unless it's localhost
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

  // HTTPS redirect: if FORCE_HTTPS env is set AND request came over plain HTTP
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
