import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const VISITOR_PROXY_LOGIN = "__livechat_visitor__";
const VISITOR_PROXY_EMAIL = "livechat-visitor@local.invalid";
const SESSION_TOKEN_TTL_DAYS = 30;
const ORIGIN_GRANT_TTL_MINUTES = 30;

function getSecret() {
  return (
    process.env.LIVECHAT_WIDGET_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "zeddash-livechat-widget-secret"
  );
}

function toBase64Url(input: Buffer) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function hmac(value: string) {
  return toBase64Url(
    crypto.createHmac("sha256", getSecret()).update(value).digest()
  );
}

export function generateWidgetToken() {
  return toBase64Url(crypto.randomBytes(24));
}

export function buildWidgetSessionToken(dialogId: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${dialogId}.${issuedAt}`;
  const signature = hmac(payload);
  return `${payload}.${signature}`;
}

export function buildWidgetHostGrant(host: string) {
  const normalized = host.trim().toLowerCase();
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${normalized}.${issuedAt}`;
  const signature = hmac(payload);
  return `${payload}.${signature}`;
}

export function verifyWidgetHostGrant(host: string, grant: string | null | undefined) {
  const normalized = host.trim().toLowerCase();
  const raw = grant?.trim() ?? "";
  if (!normalized || !raw) return false;
  const parts = raw.split(".");
  if (parts.length < 3) return false;
  const signature = parts[parts.length - 1] ?? "";
  const issuedAtRaw = parts[parts.length - 2] ?? "";
  const grantHost = parts.slice(0, -2).join(".");
  if (grantHost !== normalized) return false;
  if (!/^\d+$/.test(issuedAtRaw)) return false;

  const issuedAt = Number.parseInt(issuedAtRaw, 10);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false;
  const now = Math.floor(Date.now() / 1000);
  if (now - issuedAt > ORIGIN_GRANT_TTL_MINUTES * 60) return false;

  const payload = `${grantHost}.${issuedAtRaw}`;
  const expected = hmac(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function verifyWidgetSessionToken(dialogId: string, token: string | null | undefined) {
  const raw = token?.trim() ?? "";
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length < 3) return false;
  const signature = parts[parts.length - 1] ?? "";
  const issuedAtRaw = parts[parts.length - 2] ?? "";
  const tokenDialogId = parts.slice(0, -2).join(".");
  if (tokenDialogId !== dialogId) return false;
  if (!/^\d+$/.test(issuedAtRaw)) return false;

  const issuedAt = Number.parseInt(issuedAtRaw, 10);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false;

  const now = Math.floor(Date.now() / 1000);
  const ttl = SESSION_TOKEN_TTL_DAYS * 24 * 60 * 60;
  if (now - issuedAt > ttl) return false;

  const payload = `${tokenDialogId}.${issuedAtRaw}`;
  const expected = hmac(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function getRequestHost(headers: Headers) {
  const origin = headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).hostname.toLowerCase();
    } catch {
      // ignore
    }
  }

  const referer = headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).hostname.toLowerCase();
    } catch {
      // ignore
    }
  }

  return null;
}

export async function ensureVisitorProxyUserId() {
  const existing = await prisma.user.findUnique({
    where: { login: VISITOR_PROXY_LOGIN },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: {
      login: VISITOR_PROXY_LOGIN,
      email: VISITOR_PROXY_EMAIL,
      password: crypto.randomBytes(20).toString("hex"),
      name: "Visitor",
      surname: "Widget",
      fullname: "Visitor Widget",
      isActive: false,
      position: "External Visitor",
      company: "Live Chat Widget",
      department: "Support",
      language: "en",
      timezone: 0,
      isAdmin: false,
    },
    select: { id: true },
  });

  return created.id;
}

export function isVisitorProxyLogin(login: string | null | undefined) {
  return (login?.trim() ?? "") === VISITOR_PROXY_LOGIN;
}
