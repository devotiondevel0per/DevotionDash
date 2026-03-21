"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

type LinkifiedMessageProps = {
  text: string;
  className?: string;
  textClassName?: string;
  linkClassName?: string;
  previewClassName?: string;
  maxPreviews?: number;
};

type ParsedLink = {
  original: string;
  normalized: string;
};

const URL_PATTERN = /((https?:\/\/|www\.)[^\s<]+)/gi;
const TRAILING_PUNCTUATION = /[),.;!?]+$/;

function normalizeCandidateUrl(candidate: string): string | null {
  const prefixed = candidate.startsWith("www.") ? `https://${candidate}` : candidate;
  try {
    const url = new URL(prefixed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function collectLinks(text: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  for (const rawMatch of text.matchAll(URL_PATTERN)) {
    const source = rawMatch[0] ?? "";
    const clean = source.replace(TRAILING_PUNCTUATION, "");
    const normalized = normalizeCandidateUrl(clean);
    if (!normalized) continue;
    links.push({ original: clean, normalized });
  }
  const deduped = new Map<string, ParsedLink>();
  for (const link of links) {
    if (!deduped.has(link.normalized)) deduped.set(link.normalized, link);
  }
  return Array.from(deduped.values());
}

function isImageUrl(url: URL) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url.pathname);
}

function renderLinkParts(text: string, linkClassName?: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const rawMatch of text.matchAll(URL_PATTERN)) {
    const match = rawMatch[0] ?? "";
    const start = rawMatch.index ?? 0;
    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }

    const clean = match.replace(TRAILING_PUNCTUATION, "");
    const normalized = normalizeCandidateUrl(clean);
    const trailing = match.slice(clean.length);

    if (normalized) {
      nodes.push(
        <a
          key={`${start}-${clean}`}
          href={normalized}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("underline break-all", linkClassName)}
        >
          {clean}
        </a>
      );
    } else {
      nodes.push(match);
    }

    if (trailing) nodes.push(trailing);
    cursor = start + match.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

function LinkPreviewCard({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  let host = href;
  let path = "";
  let image = false;

  try {
    const parsed = new URL(href);
    host = parsed.hostname;
    path = `${parsed.pathname}${parsed.search}` || "/";
    image = isImageUrl(parsed);
  } catch {
    // ignore
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block rounded-md border px-2.5 py-2 transition-colors",
        "border-slate-300/70 bg-white/40 hover:bg-white/70",
        className
      )}
    >
      {image ? (
        <img
          src={href}
          alt={host}
          className="mb-2 max-h-44 w-full rounded border object-cover"
        />
      ) : null}
      <p className="truncate text-[11px] font-semibold">{host}</p>
      <p className="mt-0.5 truncate text-[11px] opacity-80">{path || "Open link"}</p>
    </a>
  );
}

export function LinkifiedMessage({
  text,
  className,
  textClassName,
  linkClassName,
  previewClassName,
  maxPreviews = 2,
}: LinkifiedMessageProps) {
  const links = useMemo(() => collectLinks(text), [text]);
  const previewLinks = links.slice(0, maxPreviews);
  const parts = useMemo(() => renderLinkParts(text, linkClassName), [text, linkClassName]);

  if (!text.trim()) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className={cn("whitespace-pre-wrap break-words", textClassName)}>{parts}</p>
      {previewLinks.length > 0 ? (
        <div className="space-y-1.5">
          {previewLinks.map((link) => (
            <LinkPreviewCard
              key={link.normalized}
              href={link.normalized}
              className={previewClassName}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

