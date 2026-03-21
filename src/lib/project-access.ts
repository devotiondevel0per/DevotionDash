import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/lib/api-access";

export interface ProjectScope {
  isPrivileged: boolean;
  isMember: boolean;
  isManager: boolean;
  membershipRole: string | null;
}

function canBypassProjectMembership(ctx: AccessContext): boolean {
  return ctx.access.isAdmin;
}

async function resolveScope(ctx: AccessContext, projectId: string): Promise<ProjectScope> {
  const isPrivileged = canBypassProjectMembership(ctx);
  if (isPrivileged) {
    return {
      isPrivileged,
      isMember: true,
      isManager: true,
      membershipRole: "manager",
    };
  }

  const membership = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: ctx.userId,
      },
    },
    select: {
      role: true,
    },
  });

  return {
    isPrivileged,
    isMember: Boolean(membership),
    isManager: membership?.role === "manager",
    membershipRole: membership?.role ?? null,
  };
}

export async function requireProjectReadAccess(
  ctx: AccessContext,
  projectId: string
): Promise<{ ok: true; scope: ProjectScope } | { ok: false; response: NextResponse }> {
  const scope = await resolveScope(ctx, projectId);

  if (!scope.isMember) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden: project access required" }, { status: 403 }),
    };
  }

  return { ok: true, scope };
}

export async function requireProjectWriteAccess(
  ctx: AccessContext,
  projectId: string,
  options?: { managerOnly?: boolean }
): Promise<{ ok: true; scope: ProjectScope } | { ok: false; response: NextResponse }> {
  const scope = await resolveScope(ctx, projectId);

  if (!scope.isMember) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: project membership required for write access" },
        { status: 403 }
      ),
    };
  }

  if (options?.managerOnly && !scope.isManager) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: project manager role required" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, scope };
}

export function canListAllProjects(ctx: AccessContext): boolean {
  return canBypassProjectMembership(ctx);
}
