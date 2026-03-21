import { Buffer } from "node:buffer";
import type { PrismaClient, TelephonyProvider } from "@prisma/client";

type TokenCacheEntry = {
  token: string;
  expiresAtMs: number;
};

type ThreeCxTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type ThreeCxCollectionResponse<T> = {
  value?: T[];
};

export type ThreeCxUser = {
  Id?: number;
  Number?: string;
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
};

export type ThreeCxCallControlParticipant = {
  id?: number;
  status?: string;
  dn?: string;
  party_dn?: string;
  party_caller_id?: string;
  party_did?: string;
  callid?: number;
  legid?: number;
  originated_by_dn?: string;
};

export type ThreeCxCallControlDnState = {
  dn?: string;
  participants?: ThreeCxCallControlParticipant[];
};

const tokenCache = new Map<string, TokenCacheEntry>();

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function hasHttpProtocol(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

export function build3cxBaseUrl(provider: TelephonyProvider) {
  const rawHost = provider.host.trim();
  if (!rawHost) return "";

  if (hasHttpProtocol(rawHost)) {
    const parsed = new URL(rawHost);
    if (!parsed.port && provider.port) {
      parsed.port = String(provider.port);
    }
    return trimTrailingSlash(`${parsed.protocol}//${parsed.host}`);
  }

  const protocol = provider.transport.toUpperCase() === "TLS" ? "https" : "http";
  const host = trimTrailingSlash(rawHost);
  const hasPort = /:\d+$/.test(host);
  const portSuffix = hasPort || !provider.port ? "" : `:${provider.port}`;
  return `${protocol}://${host}${portSuffix}`;
}

function toAbsoluteUrl(baseUrl: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimTrailingSlash(baseUrl)}${normalizedPath}`;
}

export async function getActive3cxProvider(db: PrismaClient) {
  return db.telephonyProvider.findFirst({
    where: { providerType: "3cx", isActive: true },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
}

async function fetch3cxToken(provider: TelephonyProvider, baseUrl: string) {
  const cached = tokenCache.get(provider.id);
  if (cached && cached.expiresAtMs > Date.now() + 5_000) {
    return cached.token;
  }

  const basicAuth = Buffer.from(`${provider.username}:${provider.password}`).toString("base64");
  const body = new URLSearchParams({
    client_id: provider.username,
    client_secret: provider.password,
    grant_type: "client_credentials",
  });

  const response = await fetch(toAbsoluteUrl(baseUrl, "/connect/token"), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`3CX token request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const tokenPayload = (await response.json()) as ThreeCxTokenResponse;
  const token = tokenPayload.access_token;
  if (!token) {
    throw new Error("3CX token response did not include access_token");
  }

  const expiresInSec = Math.max(tokenPayload.expires_in ?? 55, 20);
  tokenCache.set(provider.id, {
    token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  });
  return token;
}

export async function threeCxJsonRequest<T>(
  provider: TelephonyProvider,
  path: string,
  init?: RequestInit
) {
  const baseUrl = build3cxBaseUrl(provider);
  if (!baseUrl) {
    throw new Error("Invalid 3CX provider host");
  }

  const token = await fetch3cxToken(provider, baseUrl);
  const response = await fetch(toAbsoluteUrl(baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`3CX request failed (${response.status}) for ${path}: ${text.slice(0, 300)}`);
  }

  return (await response.json()) as T;
}

function normalizePhoneLike(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/[^\d+*#A-Za-z]/g, "").trim();
}

export function normalizeExtension(value: string | null | undefined) {
  return normalizePhoneLike(value);
}

export async function list3cxUsers(provider: TelephonyProvider) {
  const response = await threeCxJsonRequest<ThreeCxCollectionResponse<ThreeCxUser>>(
    provider,
    "/xapi/v1/Users?$select=Id,FirstName,LastName,Number,EmailAddress"
  );
  return Array.isArray(response.value) ? response.value : [];
}

export async function list3cxCallControlSnapshot(provider: TelephonyProvider) {
  const data = await threeCxJsonRequest<ThreeCxCallControlDnState[]>(provider, "/callcontrol");
  return Array.isArray(data) ? data : [];
}
