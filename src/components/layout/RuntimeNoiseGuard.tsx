"use client";

import { useEffect } from "react";

const METAMASK_EXTENSION_ID = "nkbihfbeogaeaoehlefnkodbefgpgknn";

function stringifyReason(reason: unknown): string {
  if (reason == null) return "";
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) return `${reason.name}: ${reason.message}\n${reason.stack ?? ""}`;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function isMetaMaskExtensionNoise(payload: unknown): boolean {
  const text = stringifyReason(payload).toLowerCase();
  return (
    text.includes("failed to connect to metamask") ||
    text.includes("metamask") ||
    text.includes("chrome-extension://") ||
    text.includes(METAMASK_EXTENSION_ID)
  );
}

const SERVER_ACTION_RELOAD_KEY = "__server_action_reload_at";
const SERVER_ACTION_RELOAD_COOLDOWN_MS = 45_000;

function isServerActionVersionMismatch(payload: unknown): boolean {
  const text = stringifyReason(payload).toLowerCase();
  return (
    text.includes("failed to find server action") &&
    (text.includes("older or newer deployment") || text.includes("server action"))
  );
}

function recoverFromServerActionMismatch() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const last = Number(window.sessionStorage.getItem(SERVER_ACTION_RELOAD_KEY) ?? "0");
  if (Number.isFinite(last) && now - last < SERVER_ACTION_RELOAD_COOLDOWN_MS) return;

  window.sessionStorage.setItem(SERVER_ACTION_RELOAD_KEY, String(now));
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(now));
  window.location.replace(url.toString());
}

export function RuntimeNoiseGuard() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const meta = `${event.message ?? ""}\n${event.filename ?? ""}\n${event.error?.stack ?? ""}`;
      if (isServerActionVersionMismatch(meta)) {
        event.preventDefault();
        recoverFromServerActionMismatch();
        return;
      }
      if (!isMetaMaskExtensionNoise(meta)) return;
      event.preventDefault();
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isServerActionVersionMismatch(event.reason)) {
        event.preventDefault();
        recoverFromServerActionMismatch();
        return;
      }
      if (!isMetaMaskExtensionNoise(event.reason)) return;
      event.preventDefault();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
