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

export function RuntimeNoiseGuard() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const meta = `${event.message ?? ""}\n${event.filename ?? ""}\n${event.error?.stack ?? ""}`;
      if (!isMetaMaskExtensionNoise(meta)) return;
      event.preventDefault();
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
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

