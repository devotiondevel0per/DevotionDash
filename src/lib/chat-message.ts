export type ChatAttachmentKind = "image" | "video" | "audio" | "file";

export interface ChatAttachmentPayload {
  id: string;
  kind: ChatAttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  durationSec?: number;
}

export interface ChatReplyPayload {
  id: string;
  text: string;
  senderName?: string;
}

export interface ChatForwardPayload {
  id: string;
  senderName?: string;
}

export interface ChatMessagePayloadV2 {
  version: 2;
  type: "text" | "media" | "system" | "deleted";
  text: string;
  attachments: ChatAttachmentPayload[];
  replyTo?: ChatReplyPayload;
  forwardedFrom?: ChatForwardPayload;
  seenByUserIds: string[];
  deletedByAdmin?: boolean;
  deletedAt?: string;
}

export interface ParsedChatMessagePayload {
  payload: ChatMessagePayloadV2;
  legacy: boolean;
}

const MARKER = "[[TWX_CHAT_V2]]";
// Base64 inflates by ~33%, so 4MB file → ~5.3MB base64. Keep total payload well under MediumText (16MB).
const MAX_ATTACHMENT_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB per file
const MAX_ATTACHMENTS = 5;

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMime(value: string) {
  return value.trim().toLowerCase();
}

function inferKind(mimeType: string): ChatAttachmentKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

function clampText(value: string, max: number) {
  const text = value.trim();
  return text.length > max ? text.slice(0, max) : text;
}

function normalizeAttachment(input: unknown): ChatAttachmentPayload | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;

  const fileName = clampText(typeof record.fileName === "string" ? record.fileName : "", 120);
  const mimeType = normalizeMime(typeof record.mimeType === "string" ? record.mimeType : "application/octet-stream");
  const dataUrl = typeof record.dataUrl === "string" ? record.dataUrl.trim() : "";
  const sizeBytesRaw = typeof record.sizeBytes === "number" ? record.sizeBytes : Number(record.sizeBytes);
  const sizeBytes = Number.isFinite(sizeBytesRaw) ? Math.max(0, Math.round(sizeBytesRaw)) : 0;
  const durationRaw = typeof record.durationSec === "number" ? record.durationSec : Number(record.durationSec);
  const durationSec = Number.isFinite(durationRaw) ? Math.max(0, Math.round(durationRaw * 100) / 100) : undefined;

  if (!fileName || !dataUrl.startsWith("data:") || sizeBytes <= 0) return null;
  if (sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) return null;

  const kindInput = typeof record.kind === "string" ? record.kind.trim().toLowerCase() : "";
  const kind: ChatAttachmentKind =
    kindInput === "image" || kindInput === "video" || kindInput === "audio" || kindInput === "file"
      ? kindInput
      : inferKind(mimeType);

  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : randomId(),
    kind,
    fileName,
    mimeType,
    sizeBytes,
    dataUrl,
    ...(durationSec !== undefined ? { durationSec } : {}),
  };
}

export function createMessagePayload(input: {
  text?: string;
  type?: "text" | "media" | "system" | "deleted";
  attachments?: unknown[];
  replyTo?: ChatReplyPayload;
  forwardedFrom?: ChatForwardPayload;
  seenByUserIds?: string[];
  deletedByAdmin?: boolean;
  deletedAt?: string;
}): ChatMessagePayloadV2 {
  const attachments = (input.attachments ?? [])
    .map((item) => normalizeAttachment(item))
    .filter((item): item is ChatAttachmentPayload => Boolean(item))
    .slice(0, MAX_ATTACHMENTS);

  const text = clampText(input.text ?? "", 8000);
  const seenByUserIds = Array.from(new Set((input.seenByUserIds ?? []).filter(Boolean)));
  const type = input.type ?? (attachments.length > 0 ? "media" : "text");

  return {
    version: 2,
    type,
    text,
    attachments,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(input.forwardedFrom ? { forwardedFrom: input.forwardedFrom } : {}),
    seenByUserIds,
    ...(input.deletedByAdmin ? { deletedByAdmin: true } : {}),
    ...(input.deletedAt ? { deletedAt: input.deletedAt } : {}),
  };
}

export function serializeMessagePayload(payload: ChatMessagePayloadV2) {
  return `${MARKER}${JSON.stringify(payload)}`;
}

export function parseMessagePayload(rawContent: string): ParsedChatMessagePayload {
  if (typeof rawContent !== "string" || rawContent.length === 0) {
    return {
      payload: createMessagePayload({ text: "" }),
      legacy: true,
    };
  }

  if (!rawContent.startsWith(MARKER)) {
    return {
      payload: createMessagePayload({ text: rawContent }),
      legacy: true,
    };
  }

  try {
    const parsed = JSON.parse(rawContent.slice(MARKER.length)) as Partial<ChatMessagePayloadV2>;
    const payload = createMessagePayload({
      text: typeof parsed.text === "string" ? parsed.text : "",
      type: parsed.type,
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      replyTo: parsed.replyTo,
      forwardedFrom: parsed.forwardedFrom,
      seenByUserIds: Array.isArray(parsed.seenByUserIds) ? parsed.seenByUserIds : [],
      deletedByAdmin: Boolean(parsed.deletedByAdmin),
      deletedAt: typeof parsed.deletedAt === "string" ? parsed.deletedAt : undefined,
    });
    return { payload, legacy: false };
  } catch {
    return {
      payload: createMessagePayload({ text: rawContent }),
      legacy: true,
    };
  }
}

export function ensureSeenBy(payload: ChatMessagePayloadV2, userId: string) {
  if (!userId.trim()) return { payload, changed: false };
  if (payload.seenByUserIds.includes(userId)) return { payload, changed: false };
  return {
    payload: {
      ...payload,
      seenByUserIds: [...payload.seenByUserIds, userId],
    },
    changed: true,
  };
}

export function createDeletedByAdminPayload(existing: ChatMessagePayloadV2) {
  return createMessagePayload({
    text: "This message was removed by administrator.",
    type: "deleted",
    attachments: [],
    replyTo: existing.replyTo,
    forwardedFrom: existing.forwardedFrom,
    seenByUserIds: existing.seenByUserIds,
    deletedByAdmin: true,
    deletedAt: new Date().toISOString(),
  });
}

