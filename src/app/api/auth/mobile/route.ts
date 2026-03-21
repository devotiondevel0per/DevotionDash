// Mobile app JWT auth endpoint
// POST /api/auth/mobile  →  { token, user }
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { z } from "zod";
import {
  clearLoginFailures,
  evaluateNetworkAccess,
  getRequestCountry,
  getRequestIp,
  getSecurityPolicy,
  isLoginBlocked,
  recordLoginFailure,
} from "@/lib/security-policy";
import { getUserTwoFactorState, verifyAndConsumeTwoFactorCode } from "@/lib/user-2fa";
import { writeAuditLog } from "@/lib/audit-log";

const schema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
  otp: z.string().optional(),
});

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "fallback-secret"
);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { login, password, otp } = parsed.data;
  const ip = getRequestIp(req.headers);
  const country = getRequestCountry(req.headers);

  const policy = await getSecurityPolicy();
  const networkCheck = evaluateNetworkAccess(policy, { ip, country });
  if (!networkCheck.allowed) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const rateLimitState = await isLoginBlocked(login, ip);
  if (rateLimitState.blocked) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ login }, { email: login }], isActive: true },
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    await recordLoginFailure(login, ip, policy);
    await writeAuditLog({
      action: "LOGIN_FAILED",
      module: "administration",
      details: JSON.stringify({ login, ip, source: "mobile" }),
      ipAddress: ip,
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // 2FA check
  const twoFactorState = await getUserTwoFactorState(user.id);
  const requires2FA = Boolean(twoFactorState?.enabled) || (policy.enforce2FAForAdmins && user.isAdmin);
  if (requires2FA) {
    if (!otp || !(await verifyAndConsumeTwoFactorCode(user.id, otp))) {
      await recordLoginFailure(login, ip, policy);
      return NextResponse.json(
        { error: "Invalid 2FA code", requires2FA: true },
        { status: 401 }
      );
    }
  }

  await clearLoginFailures(login, ip);
  await prisma.user.update({ where: { id: user.id }, data: { lastActivity: new Date() } });
  await writeAuditLog({
    userId: user.id,
    action: "LOGIN_SUCCESS",
    module: "administration",
    details: JSON.stringify({ login, ip, source: "mobile" }),
    ipAddress: ip,
  });

  // Sign JWT valid for 30 days
  const token = await new SignJWT({
    sub: user.id,
    login: user.login,
    email: user.email,
    isAdmin: user.isAdmin,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      name: user.fullname || `${user.name} ${user.surname}`.trim(),
      login: user.login,
      email: user.email,
      isAdmin: user.isAdmin,
      photoUrl: user.photoUrl,
      department: user.department,
      position: user.position,
    },
  });
}
