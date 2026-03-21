import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { buildUserAccess } from "@/lib/rbac";
import { canAccessNotificationLink } from "@/lib/notification-access";

async function resolveUserId(): Promise<string | null> {
  try {
    const session = await auth();
    if (session?.user?.id) return session.user.id;
  } catch { /* no session */ }
  const headersList = await headers();
  const authHeader = headersList.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "fallback-secret");
      const { payload } = await jwtVerify(authHeader.slice(7), secret);
      if (typeof payload.sub === "string") return payload.sub;
    } catch { return null; }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20;
  try {
    const access = await buildUserAccess(userId);
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const rows = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    const visible = rows.filter((item) => canAccessNotificationLink(item.link, access.accessibleModules));
    const unreadCount = visible.filter((item) => !item.isRead).length;
    const notifications = (unreadOnly ? visible.filter((item) => !item.isRead) : visible).slice(0, limit);
    return NextResponse.json({ notifications, unreadCount, serverTime: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const access = await buildUserAccess(userId);
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { all, id, link } = await req.json() as { all?: boolean; id?: string; link?: string };
    if (all) {
      const rows = await prisma.notification.findMany({ where: { userId }, select: { id: true, link: true }, take: 500 });
      const visibleIds = rows.filter((item) => canAccessNotificationLink(item.link, access.accessibleModules)).map((item) => item.id);
      if (visibleIds.length > 0) await prisma.notification.updateMany({ where: { id: { in: visibleIds }, userId }, data: { isRead: true } });
    } else if (id) {
      const existing = await prisma.notification.findFirst({ where: { id, userId }, select: { id: true, link: true } });
      if (existing && canAccessNotificationLink(existing.link, access.accessibleModules)) {
        await prisma.notification.update({ where: { id: existing.id }, data: { isRead: true } });
      }
    } else if (link) {
      await prisma.notification.updateMany({ where: { userId, link, isRead: false }, data: { isRead: true } });
    }
    const rows = await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 500 });
    const unreadCount = rows.filter((item) => !item.isRead && canAccessNotificationLink(item.link, access.accessibleModules)).length;
    return NextResponse.json({ ok: true, unreadCount });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
