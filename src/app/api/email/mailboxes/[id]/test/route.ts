export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess, type AccessContext } from "@/lib/api-access";
import { ImapFlow } from "imapflow";

type RouteContext = { params: Promise<{ id: string }> };

function mailboxAccessWhere(id: string, ctx: AccessContext) {
  if (ctx.access.isAdmin) return { id };
  const userEmail = ctx.userEmail?.toLowerCase().trim();
  if (!userEmail) return { id: "__none__" };
  return { id, email: userEmail };
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("email", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;
  const mailbox = await prisma.mailbox.findFirst({
    where: mailboxAccessWhere(id, accessResult.ctx),
  });
  if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });

  const client = new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    secure: mailbox.useSSL,
    auth: { user: mailbox.username, pass: mailbox.password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const status = await client.status("INBOX", { messages: true, unseen: true });
    await client.logout();
    return NextResponse.json({
      ok: true,
      messages: status.messages ?? 0,
      unseen: status.unseen ?? 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
