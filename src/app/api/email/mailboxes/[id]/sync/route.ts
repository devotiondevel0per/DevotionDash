export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess, type AccessContext } from "@/lib/api-access";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createHash } from "crypto";

type RouteContext = { params: Promise<{ id: string }> };
type EmailStatus = "inbox" | "sent" | "draft" | "spam" | "deleted";
type FolderTarget = { path: string; status: EmailStatus };
type ListEntry = { path?: string; flags?: Set<string> | string[]; specialUse?: string | null };

type ParsedMessage = {
  messageId: string;
  status: EmailStatus;
  isRead: boolean;
  subject: string;
  body: string;
  senderEmail: string | null;
  senderName: string | null;
  sentAt: Date | null;
  attachments: Array<{
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
  }>;
};

type ExistingRecord = {
  id: string;
  status: EmailStatus;
  isRead: boolean;
  subject: string;
  body: string;
  senderEmail: string | null;
  senderName: string | null;
  sentAt: Date | null;
  createdAt: Date;
  attachmentSignature: string;
};

type SyncCursor = {
  targetIndex: number;
  offset: number;
};

const STATUS_PRIORITY: Record<EmailStatus, number> = {
  inbox: 1,
  sent: 2,
  draft: 3,
  spam: 4,
  deleted: 5,
};

const mailboxSyncLocks = new Set<string>();

function mailboxAccessWhere(id: string, ctx: AccessContext) {
  if (ctx.access.isAdmin) return { id };
  const userEmail = ctx.userEmail?.toLowerCase().trim();
  if (!userEmail) return { id: "__none__" };
  return { id, email: userEmail };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function norm(value: string) {
  return value.toLowerCase().trim();
}

function hasAny(value: string, needles: string[]) {
  const v = norm(value);
  return needles.some((n) => v.includes(norm(n)));
}

function candidatePaths(list: ListEntry[], nameTokens: string[], specialTokens: string[]) {
  return list
    .filter((entry) => {
      const path = entry.path ?? "";
      const flags = Array.isArray(entry.flags) ? entry.flags : Array.from(entry.flags ?? []);
      const flagValues = flags.map((f) => norm(String(f)));
      const su = norm(String(entry.specialUse ?? ""));
      return (
        hasAny(path, nameTokens) ||
        specialTokens.some((s) => flagValues.includes(norm(s))) ||
        specialTokens.some((s) => su === norm(s))
      );
    })
    .map((entry) => entry.path ?? "")
    .filter(Boolean);
}

function resolveTargets(list: ListEntry[]) {
  const fallbackInbox = list.find((e) => norm(e.path ?? "") === "inbox")?.path ?? "INBOX";

  const pick = (values: string[], fallback = "") => values.find(Boolean) ?? fallback;

  const inboxPath = pick(candidatePaths(list, ["inbox"], ["\\Inbox", "\\inbox"]), fallbackInbox);
  const sentPath = pick(candidatePaths(list, ["sent", "sent mail"], ["\\Sent", "\\sent"]));
  const draftPath = pick(candidatePaths(list, ["draft"], ["\\Drafts", "\\drafts"]));
  const spamPath = pick(candidatePaths(list, ["spam", "junk"], ["\\Spam", "\\spam", "\\Junk", "\\junk"]));
  const trashPath = pick(candidatePaths(list, ["trash", "deleted", "bin"], ["\\Trash", "\\trash"]));

  const targets: FolderTarget[] = [];
  const seen = new Set<string>();
  const add = (path: string, status: EmailStatus) => {
    const key = norm(path);
    if (!path || seen.has(key)) return;
    seen.add(key);
    targets.push({ path, status });
  };

  add(inboxPath, "inbox");
  add(sentPath, "sent");
  add(draftPath, "draft");
  add(spamPath, "spam");
  add(trashPath, "deleted");

  return targets;
}

function attachmentSignature(items: Array<{ fileName: string; fileSize: number; mimeType: string }>) {
  return items
    .map((a) => `${a.fileName}|${a.fileSize}|${a.mimeType}`)
    .sort()
    .join("||");
}

function normalizeMessageId(raw: string | null | undefined) {
  if (!raw) return "";
  return raw.replace(/[<>\s]/g, "").trim().toLowerCase();
}

function buildFallbackMessageId(subject: string, senderEmail: string | null, sentAt: Date | null, body: string) {
  const basis = [
    subject.trim().toLowerCase(),
    (senderEmail ?? "").trim().toLowerCase(),
    sentAt ? sentAt.toISOString() : "",
    stripHtml(body).slice(0, 1200).trim().toLowerCase(),
  ].join("|");
  const digest = createHash("sha1").update(basis).digest("hex");
  return `hash:${digest}`;
}

function messageKey(input: {
  messageId?: string | null;
  emailId?: string | number | null;
  subject: string;
  senderEmail: string | null;
  sentAt: Date | null;
  body: string;
}) {
  const normalized = normalizeMessageId(input.messageId);
  if (normalized) return normalized;

  const emailId = input.emailId != null ? String(input.emailId).trim() : "";
  if (emailId) return `gm:${emailId}`;

  return buildFallbackMessageId(input.subject, input.senderEmail, input.sentAt, input.body);
}

function asValidDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function pickCanonicalRecord(records: ExistingRecord[]) {
  return records.slice().sort((a, b) => {
    const statusDelta = STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status];
    if (statusDelta !== 0) return statusDelta;

    const sentAtDelta = (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0);
    if (sentAtDelta !== 0) return sentAtDelta;

    return b.createdAt.getTime() - a.createdAt.getTime();
  })[0];
}

function decodeCursor(raw: string | null): SyncCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as SyncCursor;
    if (
      typeof parsed?.targetIndex === "number" &&
      Number.isFinite(parsed.targetIndex) &&
      typeof parsed?.offset === "number" &&
      Number.isFinite(parsed.offset)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: SyncCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const accessResult = await requireModuleAccess("email", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;

  const mailbox = await prisma.mailbox.findFirst({
    where: mailboxAccessWhere(id, accessResult.ctx),
  });
  if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  if (!mailbox.isActive) return NextResponse.json({ error: "Mailbox is inactive" }, { status: 400 });

  if (mailboxSyncLocks.has(id)) {
    return NextResponse.json({
      imported: 0,
      updated: 0,
      skipped: 0,
      total: 0,
      syncing: true,
      message: "Sync already in progress for this mailbox",
    });
  }
  mailboxSyncLocks.add(id);

  try {
    const client = new ImapFlow({
      host: mailbox.imapHost,
      port: mailbox.imapPort,
      secure: mailbox.useSSL,
      auth: { user: mailbox.username, pass: mailbox.password },
      logger: false,
      tls: { rejectUnauthorized: false },
    });

    const { searchParams } = new URL(req.url);
    const forceResync = searchParams.get("force") === "1";
    const forceCursor = decodeCursor(searchParams.get("cursor"));

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    let nextCursor: SyncCursor | null = null;

    try {
      await client.connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "IMAP connection failed";
      console.error("[IMAP connect error]", mailbox.imapHost, msg);
      return NextResponse.json({ error: `Connection failed: ${msg}` }, { status: 502 });
    }

    try {
      const mailboxListRaw = await client.list();
      const mailboxList = Array.isArray(mailboxListRaw) ? (mailboxListRaw as ListEntry[]) : [];
      const targets = resolveTargets(mailboxList);

      if (targets.length === 0) {
        await client.logout();
        await prisma.mailbox.update({ where: { id }, data: { lastSync: new Date() } });
        return NextResponse.json({ imported: 0, updated: 0, skipped: 0, total: 0, targets: [] });
      }

      const existing = await prisma.email.findMany({
        where: { mailboxId: id },
        select: {
          id: true,
          messageId: true,
          status: true,
          isRead: true,
          subject: true,
          body: true,
          senderEmail: true,
          senderName: true,
          sentAt: true,
          createdAt: true,
          attachments: {
            select: { fileName: true, fileSize: true, mimeType: true },
          },
        },
      });

      const existingByMessageId = new Map<string, ExistingRecord[]>();
      for (const row of existing) {
        const key = messageKey({
          messageId: row.messageId,
          subject: row.subject,
          senderEmail: row.senderEmail,
          sentAt: row.sentAt ?? null,
          body: row.body,
        });
        const list = existingByMessageId.get(key) ?? [];
        list.push({
          id: row.id,
          status: row.status as EmailStatus,
          isRead: Boolean(row.isRead),
          subject: row.subject,
          body: row.body,
          senderEmail: row.senderEmail,
          senderName: row.senderName,
          sentAt: row.sentAt,
          createdAt: row.createdAt,
          attachmentSignature: attachmentSignature(
            row.attachments.map((a) => ({
              fileName: a.fileName,
              fileSize: a.fileSize,
              mimeType: a.mimeType,
            }))
          ),
        });
        existingByMessageId.set(key, list);
      }

      // Purge old duplicates across the full mailbox before processing new payloads.
      const duplicateIdsToDelete: string[] = [];
      for (const [key, records] of existingByMessageId.entries()) {
        if (records.length <= 1) continue;
        const canonical = pickCanonicalRecord(records);
        const duplicates = records
          .map((r) => r.id)
          .filter((recordId) => recordId !== canonical.id);
        if (duplicates.length > 0) duplicateIdsToDelete.push(...duplicates);
        existingByMessageId.set(key, [canonical]);
      }
      if (duplicateIdsToDelete.length > 0) {
        await prisma.email.deleteMany({ where: { id: { in: duplicateIdsToDelete } } });
        updated += duplicateIdsToDelete.length;
      }

      const parsedByMessageId = new Map<string, ParsedMessage>();
      const perFolderLimit = 1200;
      const forceChunkSize = 320;

      const targetIndexes = forceResync
        ? [Math.min(Math.max(forceCursor?.targetIndex ?? 0, 0), Math.max(targets.length - 1, 0))]
        : targets.map((_, idx) => idx);

      for (const targetIndex of targetIndexes) {
        const target = targets[targetIndex];
        const lock = await client.getMailboxLock(target.path);
        try {
          const uidsResult = await client.search({ all: true }, { uid: true });
          const allUids = Array.isArray(uidsResult) ? uidsResult : [];
          if (allUids.length === 0) {
            if (forceResync) {
              nextCursor = targetIndex + 1 < targets.length
                ? { targetIndex: targetIndex + 1, offset: 0 }
                : null;
            }
            continue;
          }

          let uids: number[] = [];
          if (forceResync) {
            const endOffset =
              forceCursor && forceCursor.targetIndex === targetIndex && forceCursor.offset > 0
                ? Math.min(forceCursor.offset, allUids.length)
                : allUids.length;
            const startOffset = Math.max(0, endOffset - forceChunkSize);
            uids = allUids.slice(startOffset, endOffset);

            if (startOffset > 0) {
              nextCursor = { targetIndex, offset: startOffset };
            } else if (targetIndex + 1 < targets.length) {
              nextCursor = { targetIndex: targetIndex + 1, offset: 0 };
            } else {
              nextCursor = null;
            }
          } else {
            uids = allUids.slice(-perFolderLimit);
          }

          if (uids.length === 0) continue;

          for await (const msg of client.fetch(
            uids,
            { uid: true, flags: true, source: true, internalDate: true },
            { uid: true }
          )) {
            try {
              if (!msg.source) continue;

              const parsed = await simpleParser(msg.source);
              const isRead = msg.flags?.has("\\Seen") ?? false;

              const fromAddr = parsed.from?.value?.[0];
              const rawFromHeader = parsed.headers.get("from");
              const fallbackFrom = typeof rawFromHeader === "string" ? rawFromHeader : "";
              const fallbackEmail = (fallbackFrom.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) ?? [])[0] ?? "";
              const senderEmail = fromAddr?.address ?? fallbackEmail;
              const senderName = fromAddr?.name || senderEmail || "Unknown";
              const subject = (parsed.subject ?? "(No Subject)").slice(0, 500);

              let body = typeof parsed.html === "string" ? parsed.html.trim() : "";
              if (!body) body = parsed.text?.trim() ?? "";
              if (!body && parsed.html) body = stripHtml(String(parsed.html));
              if (!body) body = "(empty)";

              const rawMessageIdHeader = parsed.headers.get("message-id");
              let headerMessageId: string | null = null;
              if (typeof rawMessageIdHeader === "string") {
                headerMessageId = rawMessageIdHeader;
              } else if (Array.isArray(rawMessageIdHeader) && typeof rawMessageIdHeader[0] === "string") {
                headerMessageId = rawMessageIdHeader[0];
              }

              const sentAt = asValidDate(parsed.date) ?? asValidDate(msg.internalDate) ?? null;
              const msgId = messageKey({
                messageId: parsed.messageId ?? headerMessageId ?? null,
                subject,
                senderEmail: senderEmail || null,
                sentAt,
                body,
              });
              const parsedAttachments = (parsed.attachments ?? []).map((att, idx) => ({
                fileName: att.filename ?? `attachment-${idx + 1}`,
                fileSize: Number(att.size ?? 0),
                mimeType: att.contentType ?? "application/octet-stream",
                fileUrl: `imap-attachment://${id}/${encodeURIComponent(msgId)}/${idx + 1}`,
              }));

              const prev = parsedByMessageId.get(msgId);
              if (!prev || STATUS_PRIORITY[target.status] >= STATUS_PRIORITY[prev.status]) {
                parsedByMessageId.set(msgId, {
                  messageId: msgId,
                  status: target.status,
                  isRead,
                  subject,
                  body,
                  senderEmail: senderEmail || null,
                  senderName: senderName || null,
                  sentAt,
                  attachments: parsedAttachments,
                });
              }
            } catch (e) {
              errors.push(`[${target.status}] ${e instanceof Error ? e.message : "parse error"}`);
            }
          }
        } finally {
          lock.release();
        }

        if (forceResync) break;
      }

      for (const payload of parsedByMessageId.values()) {
        const records = existingByMessageId.get(payload.messageId) ?? [];
        const canonical = records.length > 0 ? pickCanonicalRecord(records) : null;

        if (!canonical) {
          await prisma.email.create({
            data: {
              subject: payload.subject,
              body: payload.body,
              senderEmail: payload.senderEmail,
              senderName: payload.senderName,
              messageId: payload.messageId,
              isRead: payload.isRead,
              sentAt: payload.sentAt,
              mailboxId: id,
              status: payload.status,
              ...(payload.attachments.length > 0
                ? { attachments: { create: payload.attachments } }
                : {}),
            },
          });
          imported++;
          continue;
        }

        const nextAttachmentSignature = attachmentSignature(
          payload.attachments.map((a) => ({
            fileName: a.fileName,
            fileSize: a.fileSize,
            mimeType: a.mimeType,
          }))
        );

        const shouldUpdate =
          canonical.status !== payload.status ||
          canonical.isRead !== payload.isRead ||
          canonical.subject !== payload.subject ||
          canonical.body !== payload.body ||
          (canonical.senderEmail ?? "") !== (payload.senderEmail ?? "") ||
          (canonical.senderName ?? "") !== (payload.senderName ?? "") ||
          (canonical.sentAt?.getTime() ?? 0) !== (payload.sentAt?.getTime() ?? 0) ||
          canonical.attachmentSignature !== nextAttachmentSignature;

        if (shouldUpdate) {
          await prisma.email.update({
            where: { id: canonical.id },
            data: {
              status: payload.status,
              isRead: payload.isRead,
              subject: payload.subject,
              body: payload.body,
              senderEmail: payload.senderEmail,
              senderName: payload.senderName,
              sentAt: payload.sentAt,
              attachments: {
                deleteMany: {},
                ...(payload.attachments.length > 0
                  ? { create: payload.attachments }
                  : {}),
              },
            },
          });
          updated++;
        } else {
          skipped++;
        }
      }

      await client.logout();
    } catch (err) {
      try {
        await client.logout();
      } catch {
        // ignore logout cleanup errors
      }
      console.error("[IMAP sync error]", err);
      const msg = err instanceof Error ? err.message : "Sync failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    await prisma.mailbox.update({ where: { id }, data: { lastSync: new Date() } });

    const hasMore = forceResync && nextCursor !== null;

    return NextResponse.json({
      imported,
      updated,
      skipped,
      total: imported + updated + skipped,
      hasMore,
      nextCursor: hasMore && nextCursor ? encodeCursor(nextCursor) : null,
      errors: errors.length ? errors.slice(0, 8) : undefined,
    });
  } finally {
    mailboxSyncLocks.delete(id);
  }
}
