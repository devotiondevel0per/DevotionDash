import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import {
  normalizeRoleKey,
  parseRolePermissionsFromDescription,
  roleTemplates,
  roleTemplateMap,
  toRoleDescriptionJson,
  type PermissionAction,
  type RolePermissionConfig,
} from "@/lib/permissions";
import { writeAuditLog, getClientIpAddress } from "@/lib/audit-log";

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

export async function GET() {
  const accessResult = await requireModuleAccess("administration", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const groups = await prisma.group.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { members: true } },
      },
    });

    const roles = groups.map((group) => ({
      id: group.id,
      name: group.name,
      color: group.color,
      description: group.description,
      memberCount: group._count.members,
      permissions: resolveRolePermissions(group.name, group.description),
      template:
        roleTemplates.find((role) => role.key === group.name.trim().toLowerCase().replace(/\s+/g, "_")) ??
        null,
      createdAt: group.createdAt,
    }));

    return NextResponse.json({
      templates: roleTemplates,
      roles,
    });
  } catch (error) {
    console.error("[GET /api/administration/roles]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("administration", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const { name, color, permissions, description } = body as {
      name?: string;
      color?: string;
      permissions?: unknown;
      description?: string;
    };

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const parsedPermissions = sanitizePermissions(permissions);
    const role = await prisma.group.create({
      data: {
        name: name.trim(),
        color: color && color.trim() ? color : "#3B4A61",
        description: parsedPermissions
          ? toRoleDescriptionJson(parsedPermissions)
          : description?.trim() || null,
      },
      include: {
        _count: { select: { members: true } },
      },
    });

    await writeAuditLog({
      userId: accessResult.ctx.userId,
      action: "ROLE_CREATED",
      module: "administration",
      targetId: role.id,
      details: JSON.stringify({
        name: role.name,
        color: role.color,
        hasCustomPermissions: Boolean(parsedPermissions),
      }),
      ipAddress: getClientIpAddress(req),
    });

    return NextResponse.json(
      {
        id: role.id,
        name: role.name,
        color: role.color,
        description: role.description,
        memberCount: role._count.members,
        permissions: resolveRolePermissions(role.name, role.description),
        createdAt: role.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/administration/roles]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
