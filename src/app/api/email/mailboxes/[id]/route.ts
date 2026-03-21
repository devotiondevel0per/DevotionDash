import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess, type AccessContext } from "@/lib/api-access";

const SAFE_SELECT = {
  id: true, name: true, email: true,
  imapHost: true, imapPort: true,
  smtpHost: true, smtpPort: true,
  username: true, useSSL: true,
  isActive: true, lastSync: true, createdAt: true,
} as const;

function mailboxAccessWhere(id: string, ctx: AccessContext) {
  if (ctx.access.isAdmin) return { id };
  const userEmail = ctx.userEmail?.toLowerCase().trim();
  if (!userEmail) return { id: "__none__" };
  return { id, email: userEmail };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("email", "manage");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  try {
    const mailbox = await prisma.mailbox.findFirst({
      where: mailboxAccessWhere(id, accessResult.ctx),
      select: { id: true },
    });
    if (!mailbox) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    const body = await req.json() as {
      name?: string; email?: string;
      imapHost?: string; imapPort?: number;
      smtpHost?: string; smtpPort?: number;
      username?: string; password?: string;
      useSSL?: boolean; isActive?: boolean;
    };

    if (!accessResult.ctx.access.isAdmin && body.email !== undefined) {
      const requesterEmail = accessResult.ctx.userEmail?.toLowerCase().trim();
      const nextMailboxEmail = String(body.email).toLowerCase().trim();
      if (!requesterEmail || requesterEmail !== nextMailboxEmail) {
        return NextResponse.json(
          { error: "Forbidden: you can only keep your own mailbox email" },
          { status: 403 }
        );
      }
    }

    const updatedMailbox = await prisma.mailbox.update({
      where: { id: mailbox.id },
      data: {
        ...(body.name      !== undefined && { name: body.name }),
        ...(body.email     !== undefined && { email: body.email }),
        ...(body.imapHost  !== undefined && { imapHost: body.imapHost }),
        ...(body.imapPort  !== undefined && { imapPort: body.imapPort }),
        ...(body.smtpHost  !== undefined && { smtpHost: body.smtpHost }),
        ...(body.smtpPort  !== undefined && { smtpPort: body.smtpPort }),
        ...(body.username  !== undefined && { username: body.username }),
        ...(body.password  !== undefined && body.password && { password: body.password }),
        ...(body.useSSL    !== undefined && { useSSL: body.useSSL }),
        ...(body.isActive  !== undefined && { isActive: body.isActive }),
      },
      select: SAFE_SELECT,
    });

    return NextResponse.json(updatedMailbox);
  } catch (error) {
    console.error("[PUT /api/email/mailboxes/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("email", "manage");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  try {
    const mailbox = await prisma.mailbox.findFirst({
      where: mailboxAccessWhere(id, accessResult.ctx),
      select: { id: true },
    });
    if (!mailbox) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const deletedEmails = await tx.email.deleteMany({
        where: { mailboxId: mailbox.id },
      });

      await tx.mailbox.delete({ where: { id: mailbox.id } });
      return { deletedEmails: deletedEmails.count };
    });

    return NextResponse.json({ ok: true, deletedEmails: result.deletedEmails });
  } catch (error) {
    console.error("[DELETE /api/email/mailboxes/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
