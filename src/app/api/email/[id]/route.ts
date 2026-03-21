import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess, type AccessContext } from "@/lib/api-access";
import { ImapFlow } from "imapflow";

type ListEntry = { path?: string; flags?: Set<string> | string[]; specialUse?: string | null };

function norm(value: string) {
  return value.toLowerCase().trim();
}

function matchesFolder(entry: ListEntry, nameTokens: string[], specialTokens: string[]) {
  const path = norm(entry.path ?? "");
  const flags = Array.isArray(entry.flags) ? entry.flags : Array.from(entry.flags ?? []);
  const flagValues = flags.map((f) => norm(String(f)));
  const su = norm(String(entry.specialUse ?? ""));
  return (
    nameTokens.some((token) => path.includes(norm(token))) ||
    specialTokens.some((token) => flagValues.includes(norm(token))) ||
    specialTokens.some((token) => su === norm(token))
  );
}

function pickPath(list: ListEntry[], nameTokens: string[], specialTokens: string[]) {
  return list.find((entry) => matchesFolder(entry, nameTokens, specialTokens))?.path ?? "";
}

async function moveRemoteToTrash(mailbox: {
  imapHost: string;
  imapPort: number;
  useSSL: boolean;
  username: string;
  password: string;
}, messageId: string) {
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
    const folders = (await client.list()) as ListEntry[];
    const trashPath =
      pickPath(folders, ["trash", "deleted", "bin"], ["\\Trash", "\\trash"]) || "Trash";
    const scanPaths = Array.from(
      new Set(
        [
          pickPath(folders, ["inbox"], ["\\Inbox", "\\inbox"]) || "INBOX",
          pickPath(folders, ["sent"], ["\\Sent", "\\sent"]),
          pickPath(folders, ["draft"], ["\\Drafts", "\\drafts"]),
          pickPath(folders, ["spam", "junk"], ["\\Spam", "\\spam", "\\Junk", "\\junk"]),
          pickPath(folders, ["all mail"], ["\\All", "\\all"]),
        ].filter(Boolean)
      )
    );

    for (const path of scanPaths) {
      const lock = await client.getMailboxLock(path);
      try {
        const withAngles = await client.search({ header: { "message-id": `<${messageId}>` } }, { uid: true });
        const withAnglesList = Array.isArray(withAngles) ? withAngles : [];
        const withoutAngles = withAnglesList.length
          ? withAngles
          : await client.search({ header: { "message-id": messageId } }, { uid: true });
        const uids = Array.isArray(withoutAngles) ? withoutAngles : [];
        if (uids.length > 0 && norm(path) !== norm(trashPath)) {
          await client.messageMove(uids, trashPath, { uid: true });
          break;
        }
      } finally {
        lock.release();
      }
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // no-op
    }
  }
}

function scopedEmailWhere(id: string, ctx: AccessContext) {
  if (ctx.access.isAdmin) {
    return { id };
  }

  const visibilityScope: Array<Record<string, unknown>> = [
    { fromId: ctx.userId },
    { recipients: { some: { userId: ctx.userId } } },
  ];
  const userEmail = ctx.userEmail?.toLowerCase().trim();
  if (userEmail) {
    visibilityScope.push({ mailbox: { is: { email: userEmail } } });
  }

  return {
    id,
    OR: visibilityScope,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("email", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const email = await prisma.email.findFirst({
      where: scopedEmailWhere(id, accessResult.ctx),
      include: {
        from: { select: { id: true, name: true, email: true } },
        recipients: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        organization: { select: { id: true, name: true } },
        mailbox: { select: { id: true, name: true, email: true } },
        attachments: true,
      },
    });

    if (!email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    return NextResponse.json(email);
  } catch (error) {
    console.error("[GET /api/email/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("email", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.email.findFirst({
      where: scopedEmailWhere(id, accessResult.ctx),
      include: {
        mailbox: {
          select: {
            imapHost: true,
            imapPort: true,
            useSSL: true,
            username: true,
            password: true,
            isActive: true,
          },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    const allowedFields: Record<string, unknown> = {};
    if (typeof body.isRead === "boolean") allowedFields.isRead = body.isRead;
    if (typeof body.isStarred === "boolean") allowedFields.isStarred = body.isStarred;
    if (body.status) allowedFields.status = body.status;

    if (
      body.status === "deleted" &&
      existing.mailbox &&
      existing.mailbox.isActive &&
      existing.messageId
    ) {
      try {
        await moveRemoteToTrash(existing.mailbox, existing.messageId);
      } catch (imapError) {
        console.error("[PUT /api/email/[id] remote-trash]", imapError);
      }
    }

    const updated = await prisma.email.update({
      where: { id },
      data: allowedFields,
      include: {
        from: { select: { id: true, name: true, email: true } },
        recipients: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PUT /api/email/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessResult = await requireModuleAccess("email", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { id } = await params;

    const existing = await prisma.email.findFirst({
      where: scopedEmailWhere(id, accessResult.ctx),
      include: {
        mailbox: {
          select: {
            imapHost: true,
            imapPort: true,
            useSSL: true,
            username: true,
            password: true,
            isActive: true,
          },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    if (
      existing.mailbox &&
      existing.mailbox.isActive &&
      existing.messageId
    ) {
      try {
        await moveRemoteToTrash(existing.mailbox, existing.messageId);
      } catch (imapError) {
        console.error("[DELETE /api/email/[id] remote-trash]", imapError);
      }
    }

    // Move to deleted status rather than hard delete
    const updated = await prisma.email.update({
      where: { id },
      data: { status: "deleted" },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[DELETE /api/email/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
