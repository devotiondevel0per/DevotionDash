import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  evaluateNetworkAccess,
  getRequestCountry,
  getRequestIp,
  getSecurityPolicy,
  isLoginBlocked,
  recordLoginFailure,
} from "@/lib/security-policy";
import { getUserTwoFactorState } from "@/lib/user-2fa";

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { login?: string; password?: string };
    const login = normalize(body.login);
    const password = normalize(body.password);

    if (!login || !password) {
      return NextResponse.json({ error: "Login and password are required." }, { status: 400 });
    }

    const policy = await getSecurityPolicy();
    const ip = getRequestIp(req.headers);
    const country = getRequestCountry(req.headers);

    const networkCheck = evaluateNetworkAccess(policy, { ip, country });
    if (!networkCheck.allowed) {
      return NextResponse.json({ error: "Blocked by security policy." }, { status: 403 });
    }

    const rateLimitState = await isLoginBlocked(login, ip);
    if (rateLimitState.blocked) {
      return NextResponse.json(
        { error: "Too many failed login attempts. Try again later." },
        { status: 423 }
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ login }, { email: login.toLowerCase() }],
        isActive: true,
      },
      select: { id: true, password: true, isAdmin: true },
    });

    if (!user) {
      await recordLoginFailure(login, ip, policy);
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      await recordLoginFailure(login, ip, policy);
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const twoFactorState = await getUserTwoFactorState(user.id);
    const requireOtp = Boolean(twoFactorState?.enabled) || (policy.enforce2FAForAdmins && user.isAdmin);

    return NextResponse.json({ ok: true, requireOtp });
  } catch (error) {
    console.error("[POST /api/auth/login-precheck]", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
