import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  normalizeRoleKey,
  parseRolePermissionsFromDescription,
  roleTemplateMap,
  toRoleDescriptionJson,
  type PermissionAction,
  type RolePermissionConfig,
} from "@/lib/permissions";
import { writeAuditLog, getClientIpAddress } from "@/lib/audit-log";

type RouteContext = { params: Promise<{ id: string }> };

function sanitizePermissions(input: unknown): RolePermissionConfig | null {
  if (!input || typeof input !== "object") return null;
  const normalized: RolePermissionConfig = {};
  const source = input as Record<string, unknown>;

  for (const [moduleId, actions] of Object.entries(source)) {
    if (!Array.isArray(actions)) continue;
    const filtered = actions.filter(
      (action): action is PermissionAction =>
        action === "read" || action === "write" || action === "manage"
    );
    if (filtered.length) {
      normalized[moduleId as keyof RolePermissionConfig] = filtered;
    }
  }

  return Object.keys(normalized).length ? normalized : null;
}

function resolveRolePermissions(name: string, description: string | null) {
  const parsed = parseRolePermissionsFromDescription(description);
  if (parsed) return parsed;
  const template = roleTemplateMap.get(normalizeRoleKey(name));
  return template?.permissions ?? null;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const role = await prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                login: true,
                name: true,
                surname: true,
                fullname: true,
                email: true,
                isActive: true,
              },
            },
          },
        },
        _count: { select: { members: true } },
      },
    });

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: role.id,
      name: role.name,
      color: role.color,
      description: role.description,
      memberCount: role._count.members,
      permissions: resolveRolePermissions(role.name, role.description),
      createdAt: role.createdAt,
      members: role.members.map((member) => ({
        id: member.id,
        role: member.role,
        user: member.user,
      })),
    });
  } catch (error) {
    console.error("[GET /api/administration/roles/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, color, permissions, description } = body as {
      name?: string;
      color?: string;
      permissions?: unknown;
      description?: string | null;
    };

    const existing = await prisma.group.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const parsedPermissions = sanitizePermissions(permissions);

    const updated = await prisma.group.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(color !== undefined && { color: color.trim() || "#3B4A61" }),
        ...(permissions !== undefined && {
          description: parsedPermissions ? toRoleDescriptionJson(parsedPermissions) : null,
        }),
        ...(permissions === undefined &&
          description !== undefined && {
            description: description?.trim() || null,
          }),
      },
      include: {
        _count: { select: { members: true } },
      },
    });

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "ROLE_UPDATED",
      module: "administration",
      targetId: updated.id,
      details: JSON.stringify({
        name: updated.name,
        color: updated.color,
        hasCustomPermissions: permissions !== undefined,
      }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      color: updated.color,
      description: updated.description,
      memberCount: updated._count.members,
      permissions: resolveRolePermissions(updated.name, updated.description),
      createdAt: updated.createdAt,
    });
  } catch (error) {
    console.error("[PUT /api/administration/roles/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const existing = await prisma.group.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    await prisma.group.delete({ where: { id } });

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "ROLE_DELETED",
      module: "administration",
      targetId: id,
      details: JSON.stringify({ name: existing.name }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/administration/roles/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
