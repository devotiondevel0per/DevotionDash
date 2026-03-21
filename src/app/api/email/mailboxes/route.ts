import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export async function GET(_req: NextRequest) {
  const accessResult = await requireModuleAccess("email", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const mailboxWhere = accessResult.ctx.access.isAdmin
      ? {}
      : accessResult.ctx.userEmail
        ? { email: accessResult.ctx.userEmail }
        : { id: "__none__" };

    const mailboxes = await prisma.mailbox.findMany({
      where: mailboxWhere,
      select: {
        id: true,
        name: true,
        email: true,
        imapHost: true,
        imapPort: true,
        smtpHost: true,
        smtpPort: true,
        username: true,
        useSSL: true,
        isActive: true,
        lastSync: true,
        createdAt: true,
        // password intentionally excluded
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(mailboxes);
  } catch (error) {
    console.error("[GET /api/email/mailboxes]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("email", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json();
    const { name, email, imapHost, imapPort, smtpHost, smtpPort, username, password, useSSL } = body;

    if (!name || !email || !imapHost || !smtpHost || !username || !password) {
      return NextResponse.json(
        { error: "name, email, imapHost, smtpHost, username, and password are required" },
        { status: 400 }
      );
    }

    if (!accessResult.ctx.access.isAdmin) {
      const requesterEmail = accessResult.ctx.userEmail?.toLowerCase().trim();
      const mailboxEmail = String(email).toLowerCase().trim();
      if (!requesterEmail || requesterEmail !== mailboxEmail) {
        return NextResponse.json(
          { error: "Forbidden: you can only create your own mailbox" },
          { status: 403 }
        );
      }
    }

    const mailbox = await prisma.mailbox.create({
      data: {
        name,
        email,
        imapHost,
        imapPort: imapPort ?? 993,
        smtpHost,
        smtpPort: smtpPort ?? 587,
        username,
        password,
        useSSL: useSSL ?? true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        imapHost: true,
        imapPort: true,
        smtpHost: true,
        smtpPort: true,
        username: true,
        useSSL: true,
        isActive: true,
        lastSync: true,
        createdAt: true,
        // password intentionally excluded
      },
    });

    return NextResponse.json(mailbox, { status: 201 });
  } catch (error) {
    console.error("[POST /api/email/mailboxes]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
