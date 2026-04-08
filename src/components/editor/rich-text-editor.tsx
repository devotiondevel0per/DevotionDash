"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  "s",
  "strike",
  "sub",
  "sup",
  "ul",
  "ol",
  "li",
  "a",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "code",
  "pre",
  "span",
  "div",
  "font",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
]);
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height"]),
  th: new Set(["colspan", "rowspan"]),
  td: new Set(["colspan", "rowspan"]),
  table: new Set(["border", "cellpadding", "cellspacing"]),
  font: new Set(["color"]),
};
const STYLE_ALLOWED_TAGS = new Set(["p", "div", "span", "li", "h1", "h2", "h3", "blockquote", "pre", "code"]);

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
  if (richTextToPlainText(input).length > 0) return true;
  return /<(img|table|hr)\b/i.test(input);
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

function sanitizeMediaSrc(raw: string) {
  const src = (raw || "").trim();
  if (!src) return "";
  if (src.startsWith("/") || /^https?:\/\//i.test(src)) return src;
  if (/^data:image\/[a-zA-Z]+;base64,/i.test(src)) return src;
  return "";
}

function sanitizeCssColor(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value;
  if (/^rgba?\(\s*[\d.\s,%]+\)$/i.test(value)) return value;
  if (/^hsla?\(\s*[\d.\s,%]+\)$/i.test(value)) return value;
  if (/^[a-z]{3,20}$/i.test(value)) return value.toLowerCase();
  return "";
}

function sanitizeInlineStyle(raw: string) {
  const declarations = raw.split(";").map((part) => part.trim()).filter(Boolean);
  const clean: string[] = [];
  for (const declaration of declarations) {
    const idx = declaration.indexOf(":");
    if (idx <= 0) continue;
    const prop = declaration.slice(0, idx).trim().toLowerCase();
    const value = declaration.slice(idx + 1).trim();
    if (!value) continue;
    if (prop === "color" || prop === "background-color") {
      const normalized = sanitizeCssColor(value);
      if (normalized) clean.push(`${prop}:${normalized}`);
      continue;
    }
    if (prop === "text-align") {
      const normalized = value.toLowerCase();
      if (["left", "center", "right", "justify"].includes(normalized)) {
        clean.push(`text-align:${normalized}`);
      }
    }
  }
  return clean.join(";");
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
        if (name === "style") {
          if (!STYLE_ALLOWED_TAGS.has(tag)) {
            element.removeAttribute(attribute.name);
            continue;
          }
          const style = sanitizeInlineStyle(attribute.value);
          if (!style) element.removeAttribute(attribute.name);
          else element.setAttribute("style", style);
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
          const fragment = doc.createDocumentFragment();
          while (element.firstChild) fragment.appendChild(element.firstChild);
          element.replaceWith(fragment);
          continue;
        }
        element.setAttribute("href", href);
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      }

      if (tag === "img") {
        const src = sanitizeMediaSrc(element.getAttribute("src") ?? "");
        if (!src) {
          element.parentNode?.removeChild(element);
          continue;
        }
        element.setAttribute("src", src);
        const alt = (element.getAttribute("alt") ?? "").trim();
        element.setAttribute("alt", alt);
      }

      if (tag === "font") {
        const color = sanitizeCssColor(element.getAttribute("color") ?? "");
        if (!color) element.removeAttribute("color");
        else element.setAttribute("color", color);
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

type ToolbarButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
};

function ToolbarButton({ onClick, disabled, title, children, className }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        "h-7 w-7 text-slate-600 hover:bg-[#AA8038]/10 hover:text-[#C78100]",
        className
      )}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </Button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write here...",
  minHeight = 140,
  disabled,
  className,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const textColorRef = useRef<HTMLInputElement | null>(null);
  const bgColorRef = useRef<HTMLInputElement | null>(null);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState("");
  const normalizedValue = useMemo(() => normalizeRichText(value), [value]);
  const showPlaceholder = !isSourceMode && !hasRichTextContent(normalizedValue);

  useEffect(() => {
    if (isSourceMode) {
      setSourceValue(normalizedValue);
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== normalizedValue) {
      editor.innerHTML = normalizedValue;
    }
  }, [isSourceMode, normalizedValue]);

  const emitChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = normalizeRichText(editor.innerHTML);
    if (editor.innerHTML !== next) editor.innerHTML = next;
    onChange(next);
  }, [onChange]);

  const runCommand = useCallback(
    (command: string, valueArg?: string) => {
      if (disabled || isSourceMode) return;
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      document.execCommand(command, false, valueArg);
      emitChange();
    },
    [disabled, emitChange, isSourceMode]
  );

  const insertHtml = useCallback(
    (html: string) => {
      if (disabled || isSourceMode) return;
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      document.execCommand("insertHTML", false, html);
      emitChange();
    },
    [disabled, emitChange, isSourceMode]
  );

  const insertLink = useCallback(() => {
    const raw = window.prompt("Enter URL", "https://");
    if (!raw) return;
    const href = sanitizeLinkHref(raw);
    if (!href) return;
    runCommand("createLink", href);
  }, [runCommand]);

  const insertImage = useCallback(() => {
    const raw = window.prompt("Enter image URL", "https://");
    if (!raw) return;
    const src = sanitizeMediaSrc(raw);
    if (!src) return;
    const alt = window.prompt("Image alt text (optional)", "") ?? "";
    insertHtml(`<img src="${src}" alt="${alt.replace(/"/g, "&quot;")}" />`);
  }, [insertHtml]);

  const insertTable = useCallback(() => {
    const rowsRaw = window.prompt("Number of rows", "2");
    if (!rowsRaw) return;
    const colsRaw = window.prompt("Number of columns", "2");
    if (!colsRaw) return;
    const rows = Math.max(1, Math.min(20, Number.parseInt(rowsRaw, 10) || 0));
    const cols = Math.max(1, Math.min(12, Number.parseInt(colsRaw, 10) || 0));
    if (!rows || !cols) return;
    const rowHtml = `<tr>${Array.from({ length: cols }).map(() => "<td>&nbsp;</td>").join("")}</tr>`;
    const html = `<table border="1" cellpadding="6" cellspacing="0"><tbody>${Array.from({ length: rows }).map(() => rowHtml).join("")}</tbody></table><p></p>`;
    insertHtml(html);
  }, [insertHtml]);

  const insertEmoji = useCallback(() => {
    const emoji = window.prompt("Insert emoji", "🙂");
    if (!emoji) return;
    runCommand("insertText", emoji);
  }, [runCommand]);

  const toggleSourceMode = useCallback(() => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!isSourceMode) {
      const html = normalizeRichText(editor?.innerHTML ?? value);
      setSourceValue(html);
      setIsSourceMode(true);
      return;
    }
    const next = normalizeRichText(sourceValue);
    onChange(next);
    setIsSourceMode(false);
    if (editor) editor.innerHTML = next;
  }, [disabled, isSourceMode, onChange, sourceValue, value]);

  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (disabled || isSourceMode) return;
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
    [disabled, emitChange, isSourceMode]
  );

  return (
    <div className={cn("overflow-hidden rounded-lg border border-slate-200 bg-white", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b bg-slate-50 px-2 py-1.5">
        <ToolbarButton
          onClick={toggleSourceMode}
          disabled={disabled}
          title={isSourceMode ? "Switch to editor mode" : "Switch to HTML/source mode"}
          className={cn("w-auto px-2 text-[10px] font-semibold", isSourceMode && "bg-[#AA8038]/10 text-[#C78100]")}
        >
          HTML
        </ToolbarButton>
        <span className="mx-0.5 h-5 w-px bg-slate-200" />

        <select
          className="h-7 rounded border bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#AA8038]/40 focus:ring-1 focus:ring-[#AA8038]/20"
          defaultValue="p"
          onChange={(event) => runCommand("formatBlock", event.currentTarget.value)}
          disabled={disabled || isSourceMode}
          title="Block style"
        >
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="blockquote">Quote</option>
          <option value="pre">Code block</option>
        </select>

        <ToolbarButton onClick={() => runCommand("bold")} disabled={disabled || isSourceMode} title="Bold"><Bold className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => runCommand("underline")} disabled={disabled || isSourceMode} title="Underline"><Underline className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => runCommand("italic")} disabled={disabled || isSourceMode} title="Italic"><Italic className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => runCommand("strikeThrough")} disabled={disabled || isSourceMode} title="Strikethrough"><span className="text-xs font-semibold line-through">S</span></ToolbarButton>
        <ToolbarButton onClick={() => runCommand("subscript")} disabled={disabled || isSourceMode} title="Subscript"><span className="text-[10px] font-semibold">X₂</span></ToolbarButton>
        <ToolbarButton onClick={() => runCommand("superscript")} disabled={disabled || isSourceMode} title="Superscript"><span className="text-[10px] font-semibold">X²</span></ToolbarButton>
        <span className="mx-0.5 h-5 w-px bg-slate-200" />

        <ToolbarButton onClick={() => runCommand("insertUnorderedList")} disabled={disabled || isSourceMode} title="Bullet list"><List className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => runCommand("insertOrderedList")} disabled={disabled || isSourceMode} title="Numbered list"><ListOrdered className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => runCommand("outdent")} disabled={disabled || isSourceMode} title="Outdent"><span className="text-[11px] font-semibold">⟵</span></ToolbarButton>
        <ToolbarButton onClick={() => runCommand("indent")} disabled={disabled || isSourceMode} title="Indent"><span className="text-[11px] font-semibold">⟶</span></ToolbarButton>
        <span className="mx-0.5 h-5 w-px bg-slate-200" />

        <ToolbarButton onClick={insertLink} disabled={disabled || isSourceMode} title="Insert link"><Link2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => runCommand("unlink")} disabled={disabled || isSourceMode} title="Remove link"><span className="text-[10px] font-semibold">Un</span></ToolbarButton>
        <ToolbarButton onClick={insertImage} disabled={disabled || isSourceMode} title="Insert image"><span className="text-[10px] font-semibold">Img</span></ToolbarButton>
        <ToolbarButton onClick={insertTable} disabled={disabled || isSourceMode} title="Insert table"><span className="text-[10px] font-semibold">Tbl</span></ToolbarButton>
        <ToolbarButton onClick={() => runCommand("insertHorizontalRule")} disabled={disabled || isSourceMode} title="Insert horizontal line"><span className="text-[11px] font-semibold">―</span></ToolbarButton>
        <ToolbarButton onClick={insertEmoji} disabled={disabled || isSourceMode} title="Insert emoji"><span className="text-sm leading-none">🙂</span></ToolbarButton>
        <span className="mx-0.5 h-5 w-px bg-slate-200" />

        <ToolbarButton onClick={() => runCommand("justifyLeft")} disabled={disabled || isSourceMode} title="Align left"><span className="text-[10px] font-semibold">L</span></ToolbarButton>
        <ToolbarButton onClick={() => runCommand("justifyCenter")} disabled={disabled || isSourceMode} title="Align center"><span className="text-[10px] font-semibold">C</span></ToolbarButton>
        <ToolbarButton onClick={() => runCommand("justifyRight")} disabled={disabled || isSourceMode} title="Align right"><span className="text-[10px] font-semibold">R</span></ToolbarButton>
        <ToolbarButton onClick={() => runCommand("justifyFull")} disabled={disabled || isSourceMode} title="Justify"><span className="text-[10px] font-semibold">J</span></ToolbarButton>

        <input
          ref={textColorRef}
          type="color"
          className="hidden"
          onChange={(event) => runCommand("foreColor", event.currentTarget.value)}
        />
        <ToolbarButton onClick={() => textColorRef.current?.click()} disabled={disabled || isSourceMode} title="Text color"><span className="text-[11px] font-semibold">A</span></ToolbarButton>

        <input
          ref={bgColorRef}
          type="color"
          className="hidden"
          onChange={(event) => runCommand("hiliteColor", event.currentTarget.value)}
        />
        <ToolbarButton onClick={() => bgColorRef.current?.click()} disabled={disabled || isSourceMode} title="Highlight color"><span className="rounded-sm bg-yellow-300 px-1 text-[10px] font-semibold text-slate-800">ab</span></ToolbarButton>

        <ToolbarButton onClick={() => runCommand("removeFormat")} disabled={disabled || isSourceMode} title="Clear formatting"><Eraser className="h-4 w-4" /></ToolbarButton>

        <div className="ml-auto flex items-center gap-1">
          <ToolbarButton onClick={() => runCommand("undo")} disabled={disabled || isSourceMode} title="Undo" className="text-slate-500 hover:bg-slate-200 hover:text-slate-700"><Undo2 className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton onClick={() => runCommand("redo")} disabled={disabled || isSourceMode} title="Redo" className="text-slate-500 hover:bg-slate-200 hover:text-slate-700"><Redo2 className="h-4 w-4" /></ToolbarButton>
        </div>
      </div>

      <div className="relative">
        {showPlaceholder ? (
          <div className="pointer-events-none absolute left-3 top-2 text-sm text-slate-400">
            {placeholder}
          </div>
        ) : null}
        {isSourceMode ? (
          <textarea
            value={sourceValue}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setSourceValue(next);
              onChange(normalizeRichText(next));
            }}
            className="h-full w-full resize-y border-0 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none"
            style={{ minHeight }}
            disabled={disabled}
            spellCheck={false}
          />
        ) : (
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
        )}
      </div>
    </div>
  );
}

