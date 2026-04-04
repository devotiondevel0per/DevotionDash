"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ClipboardEvent,
} from "react";
import {
  Bold,
  Eraser,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BIDI_CONTROL_REGEX = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "h1",
  "h2",
  "blockquote",
  "code",
  "pre",
  "span",
  "div",
]);
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
};

export function richTextToPlainText(input: string) {
  if (!input) return "";
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasRichTextContent(input: string) {
  return richTextToPlainText(input).length > 0;
}

function sanitizeLinkHref(raw: string) {
  const href = (raw || "").trim();
  if (!href) return "";
  if (href.startsWith("/") || href.startsWith("#")) return href;
  if (/^https?:\/\//i.test(href)) return href;
  if (/^mailto:/i.test(href)) return href;
  if (/^tel:/i.test(href)) return href;
  return "";
}

function normalizeFallback(input: string) {
  return input
    .replace(BIDI_CONTROL_REGEX, "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/ on\w+="[^"]*"/gi, "")
    .replace(/ on\w+='[^']*'/gi, "")
    .trim();
}

export function normalizeRichText(input: string) {
  if (!input) return "";
  const source = input.replace(BIDI_CONTROL_REGEX, "").trim();
  if (!source) return "";

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return normalizeFallback(source);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${source}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  const sanitizeNode = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.parentNode?.removeChild(child);
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const element = child as HTMLElement;
      sanitizeNode(element);

      const tag = element.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        const fragment = doc.createDocumentFragment();
        while (element.firstChild) fragment.appendChild(element.firstChild);
        element.replaceWith(fragment);
        continue;
      }

      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        if (name.startsWith("on")) {
          element.removeAttribute(attribute.name);
          continue;
        }
        const allowedForTag = ALLOWED_ATTRIBUTES[tag];
        if (!allowedForTag?.has(name)) {
          element.removeAttribute(attribute.name);
        }
      }

      if (tag === "a") {
        const href = sanitizeLinkHref(element.getAttribute("href") ?? "");
        if (!href) {
          element.removeAttribute("href");
        } else {
          element.setAttribute("href", href);
          element.setAttribute("target", "_blank");
          element.setAttribute("rel", "noopener noreferrer");
        }
      }
    }
  };

  sanitizeNode(root);
  const normalized = root.innerHTML.trim();
  if (!hasRichTextContent(normalized)) return "";
  return normalized;
}

type RichTextEditorProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
  className?: string;
};

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write here...",
  minHeight = 140,
  disabled,
  className,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const normalizedValue = useMemo(() => normalizeRichText(value), [value]);
  const showPlaceholder = !hasRichTextContent(normalizedValue);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== normalizedValue) {
      editor.innerHTML = normalizedValue;
    }
  }, [normalizedValue]);

  const emitChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = normalizeRichText(editor.innerHTML);
    if (editor.innerHTML !== next) editor.innerHTML = next;
    onChange(next);
  }, [onChange]);

  const runCommand = useCallback(
    (command: string, valueArg?: string) => {
      if (disabled) return;
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      document.execCommand(command, false, valueArg);
      emitChange();
    },
    [disabled, emitChange]
  );

  const insertLink = useCallback(() => {
    const raw = window.prompt("Enter URL", "https://");
    if (!raw) return;
    const href = sanitizeLinkHref(raw);
    if (!href) return;
    runCommand("createLink", href);
  }, [runCommand]);

  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      const html = event.clipboardData.getData("text/html");
      const text = event.clipboardData.getData("text/plain");
      const payload = html
        ? normalizeRichText(html)
        : text
            .replace(BIDI_CONTROL_REGEX, "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .join("<br/>");
      if (!payload) return;
      document.execCommand("insertHTML", false, payload);
      emitChange();
    },
    [disabled, emitChange]
  );

  return (
    <div className={cn("overflow-hidden rounded-lg border border-slate-200 bg-white", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b bg-slate-50 px-2 py-1.5">
        <select
          className="h-8 rounded border bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#FE0000]/40 focus:ring-1 focus:ring-[#FE0000]/20"
          defaultValue="p"
          onChange={(event) => runCommand("formatBlock", event.currentTarget.value)}
          disabled={disabled}
        >
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="blockquote">Quote</option>
        </select>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:bg-[#FE0000]/10 hover:text-[#c70000]" onClick={() => runCommand("bold")} disabled={disabled}>
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:bg-[#FE0000]/10 hover:text-[#c70000]" onClick={() => runCommand("italic")} disabled={disabled}>
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:bg-[#FE0000]/10 hover:text-[#c70000]" onClick={() => runCommand("underline")} disabled={disabled}>
          <Underline className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:bg-[#FE0000]/10 hover:text-[#c70000]" onClick={() => runCommand("insertUnorderedList")} disabled={disabled}>
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:bg-[#FE0000]/10 hover:text-[#c70000]" onClick={() => runCommand("insertOrderedList")} disabled={disabled}>
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:bg-[#FE0000]/10 hover:text-[#c70000]" onClick={insertLink} disabled={disabled}>
          <Link2 className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:bg-[#FE0000]/10 hover:text-[#c70000]" onClick={() => runCommand("removeFormat")} disabled={disabled}>
          <Eraser className="h-4 w-4" />
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:bg-slate-200 hover:text-slate-700" onClick={() => runCommand("undo")} disabled={disabled}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:bg-slate-200 hover:text-slate-700" onClick={() => runCommand("redo")} disabled={disabled}>
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative">
        {showPlaceholder ? (
          <div className="pointer-events-none absolute left-3 top-2 text-sm text-slate-400">
            {placeholder}
          </div>
        ) : null}
        <div
          ref={editorRef}
          dir="ltr"
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={emitChange}
          onPaste={onPaste}
          className={cn(
            "prose prose-sm max-w-none px-3 py-2 text-slate-800 outline-none",
            disabled ? "cursor-not-allowed bg-slate-100 text-slate-500" : "bg-white"
          )}
          style={{ minHeight }}
        />
      </div>
    </div>
  );
}
