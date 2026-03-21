import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import nodemailer from "nodemailer";

type IncomingAttachment = {
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  dataUrl?: string;
};

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderOutgoingHtml(body: string) {
  if (/<\/?[a-z][\s\S]*>/i.test(body)) return body;

  let html = escapeHtml(body);
  html = html.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi,
    (_m, alt: string, url: string) =>
      `<img src=\"${url}\" alt=\"${escapeHtml(String(alt || "image"))}\" style=\"max-width:100%;height:auto;border-radius:8px;border:1px solid #e5e7eb;\"/>`
  );
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi,
    (_m, label: string, url: string) =>
      `<a href=\"${url}\" target=\"_blank\" rel=\"noreferrer\" style=\"color:#c30000;text-decoration:underline;\">${escapeHtml(String(label))}</a>`
  );
  html = html.replace(
    /(^|[\s(>])(https?:\/\/[^\s<)]+)/gi,
    (_m, prefix: string, url: string) =>
      `${prefix}<a href=\"${url}\" target=\"_blank\" rel=\"noreferrer\" style=\"color:#c30000;text-decoration:underline;\">${url}</a>`
  );
  html = html.replace(/\n/g, "<br/>");
  return `<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#202124;\">${html}</div>`;
}

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("email", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const userId = accessResult.ctx.userId;
    const isAdmin = accessResult.ctx.access.isAdmin;
    const userEmail = accessResult.ctx.userEmail?.toLowerCase().trim() ?? null;

    const { searchParams } = new URL(req.url);
    const mailboxId = searchParams.get("mailboxId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const starred = searchParams.get("starred");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 10000);

    const and: Record<string, unknown>[] = [];
    if (!isAdmin) {
      const visibilityScope: Record<string, unknown>[] = [
        { fromId: userId },
        { recipients: { some: { userId } } },
      ];
      if (userEmail) {
        visibilityScope.push({ mailbox: { is: { email: userEmail } } });
      }
      and.push({ OR: visibilityScope });
    }

    if (mailboxId) and.push({ mailboxId });
    if (status) and.push({ status });
    if (starred === "true") and.push({ isStarred: true });
    if (search) {
      and.push({
        OR: [{ subject: { contains: search } }, { body: { contains: search } }],
      });
    }
    const where: Record<string, unknown> = and.length > 0 ? { AND: and } : {};

    const emails = await prisma.email.findMany({
      where,
      include: {
        from: { select: { id: true, name: true, fullname: true, email: true } },
        recipients: {
          include: {
            user: { select: { id: true, name: true, fullname: true, email: true } },
          },
        },
        organization: { select: { id: true, name: true } },
        mailbox: { select: { id: true, name: true, email: true } },
        attachments: { select: { id: true, fileName: true, fileSize: true, mimeType: true, fileUrl: true } },
        _count: { select: { attachments: true } },
      },
      orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    return NextResponse.json(emails);
  } catch (error) {
    console.error("[GET /api/email]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("email", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const body = await req.json() as {
      subject?: string;
      body?: string;
      toUserIds?: string[];
      ccUserIds?: string[];
      bccUserIds?: string[];
      toEmails?: string[];
      ccEmails?: string[];
      bccEmails?: string[];
      attachments?: IncomingAttachment[];
      mailboxId?: string;
      organizationId?: string;
      parentId?: string;
      threadId?: string;
      isDraft?: boolean;
    };

    const {
      subject,
      body: emailBody,
      toUserIds = [],
      ccUserIds = [],
      bccUserIds = [],
      toEmails = [],
      ccEmails = [],
      bccEmails = [],
      attachments = [],
      mailboxId,
      organizationId,
      parentId,
      isDraft = false,
    } = body;

    if (!subject || !emailBody) {
      return NextResponse.json({ error: "subject and body are required" }, { status: 400 });
    }
    const outgoingHtml = renderOutgoingHtml(emailBody);

    // Determine threadId: inherit from parent's thread or use parent's id
    let resolvedThreadId = body.threadId;
    if (!resolvedThreadId && parentId) {
      const parent = await prisma.email.findUnique({
        where: { id: parentId },
        select: { threadId: true, id: true },
      });
      resolvedThreadId = parent?.threadId ?? parent?.id ?? undefined;
    }

    const toIds = Array.from(new Set(toUserIds.filter(Boolean)));
    const ccIds = Array.from(new Set(ccUserIds.filter(Boolean)));
    const bccIds = Array.from(new Set(bccUserIds.filter(Boolean)));
    const toExternal = Array.from(new Set(toEmails.filter(Boolean)));
    const ccExternal = Array.from(new Set(ccEmails.filter(Boolean)));
    const bccExternal = Array.from(new Set(bccEmails.filter(Boolean)));

    if (
      !isDraft &&
      toIds.length === 0 &&
      ccIds.length === 0 &&
      bccIds.length === 0 &&
      toExternal.length === 0 &&
      ccExternal.length === 0 &&
      bccExternal.length === 0
    ) {
      return NextResponse.json({ error: "at least one recipient is required" }, { status: 400 });
    }

    const userEmail = accessResult.ctx.userEmail?.toLowerCase().trim() ?? null;
    const isAdmin = accessResult.ctx.access.isAdmin;

    if (!isAdmin && mailboxId) {
      const ownedMailbox = await prisma.mailbox.findFirst({
        where: {
          id: mailboxId,
          ...(userEmail ? { email: userEmail } : { id: "__none__" }),
        },
        select: { id: true },
      });
      if (!ownedMailbox) {
        return NextResponse.json(
          { error: "Forbidden: mailbox access denied" },
          { status: 403 }
        );
      }
    }

    const allRecipients = [
      ...toIds.map((userId) => ({ userId, type: "to" as const })),
      ...ccIds.map((userId) => ({ userId, type: "cc" as const })),
      ...bccIds.map((userId) => ({ userId, type: "bcc" as const })),
    ];

    const internalRecipientIds = Array.from(new Set([...toIds, ...ccIds, ...bccIds]));
    const internalUsers = internalRecipientIds.length
      ? await prisma.user.findMany({
          where: { id: { in: internalRecipientIds } },
          select: { id: true, email: true },
        })
      : [];
    const internalEmailMap = new Map(internalUsers.map((u) => [u.id, u.email]));

    const toList = [...toIds.map((id) => internalEmailMap.get(id)).filter(Boolean), ...toExternal] as string[];
    const ccList = [...ccIds.map((id) => internalEmailMap.get(id)).filter(Boolean), ...ccExternal] as string[];
    const bccList = [...bccIds.map((id) => internalEmailMap.get(id)).filter(Boolean), ...bccExternal] as string[];
    const normalizedAttachments = attachments
      .filter((att) => att && att.dataUrl && att.fileName)
      .slice(0, 10);

    let outboundMessageId: string | null = null;
    let senderAddress: string | null = null;
    let senderLabel: string | null = null;
    let resolvedMailboxId: string | null = mailboxId ?? null;

    if (!isDraft) {
      const sendMailbox = mailboxId
        ? await prisma.mailbox.findFirst({
            where: {
              id: mailboxId,
              isActive: true,
              ...(isAdmin ? {} : userEmail ? { email: userEmail } : { id: "__none__" }),
            },
          })
        : await prisma.mailbox.findFirst({
            where: {
              isActive: true,
              ...(isAdmin ? {} : userEmail ? { email: userEmail } : { id: "__none__" }),
            },
            orderBy: { createdAt: "asc" },
          });

      if (!sendMailbox) {
        return NextResponse.json({ error: "No active mailbox configured for sending" }, { status: 400 });
      }
      resolvedMailboxId = sendMailbox.id;
      senderAddress = sendMailbox.email;
      senderLabel = sendMailbox.name;

      let inReplyTo: string | undefined;
      let references: string | undefined;
      if (parentId) {
        const parent = await prisma.email.findUnique({
          where: { id: parentId },
          select: { messageId: true, parentId: true, threadId: true },
        });
        if (parent?.messageId) {
          inReplyTo = `<${parent.messageId}>`;
          references = `<${parent.messageId}>`;
        }
      }

      const transport = nodemailer.createTransport({
        host: sendMailbox.smtpHost,
        port: sendMailbox.smtpPort,
        // SMTP SSL mode depends on port: 465 = implicit TLS, 587/25 = STARTTLS/plain upgrade.
        secure: sendMailbox.smtpPort === 465,
        auth: { user: sendMailbox.username, pass: sendMailbox.password },
        tls: { rejectUnauthorized: false },
      });

      try {
        const info = await transport.sendMail({
          from: `${sendMailbox.name} <${sendMailbox.email}>`,
          to: toList.length ? toList : undefined,
          cc: ccList.length ? ccList : undefined,
          bcc: bccList.length ? bccList : undefined,
          subject,
          html: outgoingHtml,
          text: emailBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
          attachments: normalizedAttachments
            .map((att) => {
              const parsed = parseDataUrl(String(att.dataUrl));
              if (!parsed) return null;
              return {
                filename: String(att.fileName),
                content: Buffer.from(parsed.base64, "base64"),
                contentType: att.mimeType ?? parsed.mimeType ?? "application/octet-stream",
              };
            })
            .filter(Boolean) as Array<{ filename: string; content: Buffer; contentType: string }>,
          ...(inReplyTo ? { inReplyTo } : {}),
          ...(references ? { references } : {}),
        });
        const normalized = typeof info.messageId === "string" ? info.messageId.replace(/[<>]/g, "").trim() : "";
        outboundMessageId = normalized || null;
      } catch (smtpError) {
        console.error("[POST /api/email SMTP]", smtpError);
        const msg = smtpError instanceof Error ? smtpError.message : "SMTP send failed";
        return NextResponse.json({ error: `Failed to send email via SMTP: ${msg}` }, { status: 502 });
      }
    }

    const email = await prisma.email.create({
      data: {
        subject,
        body: emailBody,
        fromId: accessResult.ctx.userId,
        senderEmail: senderAddress,
        senderName: senderLabel,
        messageId: outboundMessageId,
        status: isDraft ? "draft" : "sent",
        sentAt: isDraft ? null : new Date(),
        ...(resolvedMailboxId ? { mailboxId: resolvedMailboxId } : {}),
        ...(organizationId ? { organizationId } : {}),
        ...(parentId ? { parentId } : {}),
        ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
        ...(normalizedAttachments.length > 0
          ? {
              attachments: {
                create: normalizedAttachments.map((att, idx) => ({
                  fileName: String(att.fileName),
                  fileSize: Number(att.fileSize ?? 0),
                  mimeType: String(att.mimeType ?? "application/octet-stream"),
                  fileUrl: `compose-attachment://${Date.now()}/${idx + 1}`,
                })),
              },
            }
          : {}),
        ...(allRecipients.length > 0 ? {
          recipients: { create: allRecipients },
        } : {}),
      },
      include: {
        from: { select: { id: true, name: true, fullname: true, email: true } },
        recipients: {
          include: {
            user: { select: { id: true, name: true, fullname: true, email: true } },
          },
        },
        mailbox: { select: { id: true, name: true, email: true } },
        attachments: { select: { id: true, fileName: true, fileSize: true, mimeType: true, fileUrl: true } },
        _count: { select: { attachments: true } },
      },
    });

    return NextResponse.json(email, { status: 201 });
  } catch (error) {
    console.error("[POST /api/email]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
