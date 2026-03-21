import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
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
import { validateImpersonationToken } from "@/lib/impersonation";

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
  otp: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        login: { label: "Login", type: "text" },
        password: { label: "Password", type: "password" },
        otp: { label: "2-Step Code", type: "text" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { login, password, otp } = parsed.data;

        // Resolve which DB to use based on request host
        const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
        const { isPlatformDomain, getTenantByDomain } = await import("@/lib/tenant-registry");
        const { getTenantClientByUrl } = await import("@/lib/tenant-client");

        let authDb: import("@prisma/client").PrismaClient = prisma;
        let tenantId: string | undefined;

        if (!isPlatformDomain(host)) {
          const tenant = await getTenantByDomain(host);
          if (!tenant) return null;
          if (tenant.status === "suspended" || tenant.status === "cancelled") return null;
          authDb = getTenantClientByUrl(tenant.databaseUrl);
          tenantId = tenant.id;
        }

        const policy = await getSecurityPolicy();
        const ip = getRequestIp(request.headers);
        const country = getRequestCountry(request.headers);
        const networkCheck = evaluateNetworkAccess(policy, { ip, country });
        if (!networkCheck.allowed) {
          await writeAuditLog({
            action: "LOGIN_BLOCKED_NETWORK",
            module: "administration",
            details: JSON.stringify({ login, ip, country, reason: networkCheck.reason ?? "blocked" }),
            ipAddress: ip,
          });
          return null;
        }

        const rateLimitState = await isLoginBlocked(login, ip);
        if (rateLimitState.blocked) {
          await writeAuditLog({
            action: "LOGIN_BLOCKED_RATE",
            module: "administration",
            details: JSON.stringify({ login, ip, blockedUntil: rateLimitState.blockedUntil }),
            ipAddress: ip,
          });
          return null;
        }

        const user = await authDb.user.findFirst({
          where: {
            OR: [{ login }, { email: login }],
            isActive: true,
          },
        });

        if (!user) {
          await recordLoginFailure(login, ip, policy);
          await writeAuditLog({
            action: "LOGIN_FAILED",
            module: "administration",
            details: JSON.stringify({ login, ip, reason: "user_not_found" }),
            ipAddress: ip,
          });
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
          await recordLoginFailure(login, ip, policy);
          await writeAuditLog({
            userId: user.id,
            action: "LOGIN_FAILED",
            module: "administration",
            details: JSON.stringify({ login, ip, reason: "password_mismatch" }),
            ipAddress: ip,
          });
          return null;
        }

        const twoFactorState = await getUserTwoFactorState(user.id);
        const requiresTwoFactor = Boolean(twoFactorState?.enabled) || (policy.enforce2FAForAdmins && user.isAdmin);
        if (requiresTwoFactor) {
          if (!twoFactorState?.enabled) {
            await recordLoginFailure(login, ip, policy);
            await writeAuditLog({
              userId: user.id,
              action: "LOGIN_2FA_REQUIRED",
              module: "administration",
              details: JSON.stringify({ login, ip, reason: "2fa_not_enabled_for_required_user" }),
              ipAddress: ip,
            });
            return null;
          }
          if (!otp || !(await verifyAndConsumeTwoFactorCode(user.id, otp))) {
            await recordLoginFailure(login, ip, policy);
            await writeAuditLog({
              userId: user.id,
              action: "LOGIN_2FA_FAILED",
              module: "administration",
              details: JSON.stringify({ login, ip }),
              ipAddress: ip,
            });
            return null;
          }
        }

        await clearLoginFailures(login, ip);

        await authDb.user.update({
          where: { id: user.id },
          data: { lastActivity: new Date() },
        });

        await writeAuditLog({
          userId: user.id,
          action: "LOGIN_SUCCESS",
          module: "administration",
          details: JSON.stringify({ login, ip, country }),
          ipAddress: ip,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.fullname || `${user.name} ${user.surname}`.trim(),
          login: user.login,
          isAdmin: user.isAdmin,
          photoUrl: user.photoUrl,
          department: user.department,
          position: user.position,
          twoFactorEnabled: Boolean(twoFactorState?.enabled),
          tenantId,
        };
      },
    }),
    // Impersonation provider — admin-only, uses one-time token
    Credentials({
      id: "impersonate",
      name: "impersonate",
      credentials: {
        token: { label: "Impersonation Token", type: "text" },
      },
      async authorize(credentials) {
        const token = credentials?.token as string | undefined;
        if (!token) return null;

        const result = await validateImpersonationToken(token);
        if (!result) return null;

        const { adminId, targetUserId } = result;

        const [admin, target] = await Promise.all([
          prisma.user.findUnique({ where: { id: adminId }, select: { id: true, isAdmin: true } }),
          prisma.user.findUnique({
            where: { id: targetUserId },
            select: {
              id: true, email: true, name: true, surname: true, fullname: true,
              login: true, isAdmin: true, photoUrl: true, department: true,
              position: true, isActive: true,
            },
          }),
        ]);

        if (!admin?.isAdmin || !target?.isActive) return null;

        return {
          id: target.id,
          email: target.email,
          name: target.fullname || `${target.name} ${target.surname}`.trim(),
          login: target.login,
          isAdmin: target.isAdmin,
          photoUrl: target.photoUrl,
          department: target.department,
          position: target.position,
          twoFactorEnabled: false,
          impersonatedBy: adminId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const authUser = user as {
          id: string;
          login?: string;
          isAdmin?: boolean;
          photoUrl?: string | null;
          department?: string;
          position?: string;
          twoFactorEnabled?: boolean;
          impersonatedBy?: string;
          tenantId?: string;
        };

        token.id = user.id;
        token.login = authUser.login;
        token.isAdmin = authUser.isAdmin;
        // Don't store base64 data URLs in the JWT — they bloat cookies past the 8KB header limit
        const photo = authUser.photoUrl ?? "";
        token.photoUrl = photo.startsWith("data:") ? null : photo || null;
        token.department = authUser.department;
        token.position = authUser.position;
        token.twoFactorEnabled = authUser.twoFactorEnabled;
        token.authAt = Date.now();
        if (authUser.impersonatedBy) {
          token.impersonatedBy = authUser.impersonatedBy;
        }
        if (authUser.tenantId) {
          token.tenantId = authUser.tenantId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.login = token.login;
        session.user.isAdmin = token.isAdmin;
        session.user.photoUrl = token.photoUrl;
        session.user.department = token.department;
        session.user.position = token.position;
        session.user.twoFactorEnabled = token.twoFactorEnabled;
        session.user.authAt = token.authAt;
        session.user.impersonatedBy = token.impersonatedBy as string | undefined;
      }
      return session;
    },
  },
});
