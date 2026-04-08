import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { buildUserAccess } from "@/lib/rbac";
import { getClientIpAddress, writeAuditLog } from "@/lib/audit-log";
import { getSecurityPolicy, validatePasswordWithPolicy } from "@/lib/security-policy";
import { syncUserRolePermissionOverride } from "@/lib/user-role-overrides";

export async function GET() {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        login: true,
        email: true,
        name: true,
        surname: true,
        fullname: true,
        position: true,
        department: true,
        photoUrl: true,
        isAdmin: true,
        isActive: true,
        workState: true,
        lastActivity: true,
        createdAt: true,
        groupMembers: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
                color: true,
                description: true,
              },
            },
          },
          orderBy: { group: { name: "asc" } },
        },
      },
    });

    const enriched = await Promise.all(
      users.map(async (user) => {
        const userAccess = await buildUserAccess(user.id);

        return {
          ...user,
          roles: user.groupMembers.map((member) => ({
            id: member.group.id,
            name: member.group.name,
            color: member.group.color,
            membershipRole: member.role,
          })),
          permissions: userAccess?.permissions ?? null,
          accessibleModules: userAccess?.accessibleModules ?? [],
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("[GET /api/administration/users]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = (await req.json()) as {
      login?: string;
      email?: string;
      password?: string;
      name?: string;
      surname?: string;
      fullname?: string;
      position?: string;
      department?: string;
      isAdmin?: boolean;
      isActive?: boolean;
      roleIds?: string[];
    };

    const login = (body.login ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const name = (body.name ?? "").trim();
    const surname = (body.surname ?? "").trim();
    const fullname = (body.fullname ?? "").trim() || `${name} ${surname}`.trim();
    const position = (body.position ?? "").trim();
    const department = (body.department ?? "").trim();
    const isAdmin = Boolean(body.isAdmin);
    const isActive = body.isActive ?? true;
    const roleIds = Array.isArray(body.roleIds)
      ? Array.from(new Set(body.roleIds.map((value) => String(value).trim()).filter(Boolean)))
      : [];

    if (!login || !/^[a-zA-Z0-9._-]{3,32}$/.test(login)) {
      return NextResponse.json(
        { error: "Login must be 3-32 characters and use letters, numbers, dot, underscore, or dash." },
        { status: 400 }
      );
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "First name is required." }, { status: 400 });
    }
    if (password.length > 128) {
      return NextResponse.json({ error: "Password cannot exceed 128 characters." }, { status: 400 });
    }

    const policy = await getSecurityPolicy();
    const passwordValidation = validatePasswordWithPolicy(password, policy);
    if (passwordValidation) {
      return NextResponse.json({ error: passwordValidation }, { status: 400 });
    }

    const [existingLogin, existingEmail] = await Promise.all([
      prisma.user.findUnique({ where: { login }, select: { id: true } }),
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
    ]);
    if (existingLogin) {
      return NextResponse.json({ error: "Login already exists." }, { status: 409 });
    }
    if (existingEmail) {
      return NextResponse.json({ error: "Email already exists." }, { status: 409 });
    }

    const roleRecords = roleIds.length
      ? await prisma.group.findMany({
        where: { id: { in: roleIds } },
        select: { id: true, name: true, color: true },
      })
      : [];

    const passwordHash = await bcrypt.hash(password, 12);

    const createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          login,
          email,
          password: passwordHash,
          name,
          surname,
          fullname,
          position,
          department,
          isAdmin,
          isActive,
        },
        select: {
          id: true,
          login: true,
          email: true,
          name: true,
          surname: true,
          fullname: true,
          position: true,
          department: true,
          isAdmin: true,
          isActive: true,
          workState: true,
          lastActivity: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (roleRecords.length > 0) {
        await tx.groupMember.createMany({
          data: roleRecords.map((role) => ({
            groupId: role.id,
            userId: user.id,
            role: "member",
          })),
          skipDuplicates: true,
        });
      }

      return user;
    });

    await syncUserRolePermissionOverride(
      prisma,
      createdUser.id,
      roleRecords.map((role) => role.id)
    );

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "USER_CREATED",
      module: "administration",
      targetId: createdUser.id,
      details: JSON.stringify({
        login: createdUser.login,
        email: createdUser.email,
        isAdmin: createdUser.isAdmin,
        isActive: createdUser.isActive,
        roleIds: roleRecords.map((role) => role.id),
      }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json(
      {
        ...createdUser,
        roles: roleRecords,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/administration/users]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
