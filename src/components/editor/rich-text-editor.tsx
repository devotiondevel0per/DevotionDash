"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import {
  BarChart3,
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

function encodeSvgDataUri(svg: string) {
  const encoded = typeof window !== "undefined"
    ? window.btoa(unescape(encodeURIComponent(svg)))
    : "";
  return `data:image/svg+xml;base64,${encoded}`;
}

function buildChartSvg(
  labels: string[],
  values: number[],
  chartType: "bar" | "line"
) {
  const width = 780;
  const height = 420;
  const margin = { top: 36, right: 24, bottom: 96, left: 56 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const max = Math.max(...values, 1);
  const pointGap = labels.length > 1 ? chartWidth / (labels.length - 1) : chartWidth;
  const barWidth = Math.max(24, Math.min(86, chartWidth / Math.max(values.length * 1.8, 1)));

  const toY = (value: number) => margin.top + chartHeight - (value / max) * chartHeight;
  const xFor = (index: number) =>
    labels.length <= 1 ? margin.left + chartWidth / 2 : margin.left + index * pointGap;
  const grid = Array.from({ length: 5 }).map((_, idx) => {
    const ratio = idx / 4;
    const y = margin.top + ratio * chartHeight;
    const value = Math.round(max - ratio * max);
    return `<line x1="${margin.left}" y1="${y}" x2="${margin.left + chartWidth}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />
<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#64748b">${value}</text>`;
  }).join("");

  const bars = values.map((value, idx) => {
    const x = xFor(idx) - barWidth / 2;
    const y = toY(value);
    const h = margin.top + chartHeight - y;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="6" fill="#AA8038" opacity="0.9" />`;
  }).join("");

  const linePath = values.map((value, idx) => {
    const cmd = idx === 0 ? "M" : "L";
    return `${cmd}${xFor(idx)},${toY(value)}`;
  }).join(" ");
  const linePoints = values.map((value, idx) => `<circle cx="${xFor(idx)}" cy="${toY(value)}" r="4" fill="#AA8038" />`).join("");

  const labelsSvg = labels.map((label, idx) => {
    const x = xFor(idx);
    const y = margin.top + chartHeight + 18;
    const safe = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<text x="${x}" y="${y}" text-anchor="middle" font-size="12" fill="#475569">${safe}</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#ffffff" />
<text x="${margin.left}" y="22" font-size="16" font-weight="700" fill="#1e293b">Chart</text>
${grid}
<line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${margin.left + chartWidth}" y2="${margin.top + chartHeight}" stroke="#cbd5e1" stroke-width="1.5" />
<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" stroke="#cbd5e1" stroke-width="1.5" />
${chartType === "bar"
    ? bars
    : `<path d="${linePath}" fill="none" stroke="#AA8038" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />${linePoints}`}
${labelsSvg}
</svg>`;
}

type RichTextEditorProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
  className?: string;
  imageUploadEndpoint?: string;
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
  imageUploadEndpoint = "/api/upload",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const textColorRef = useRef<HTMLInputElement | null>(null);
  const bgColorRef = useRef<HTMLInputElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
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

  const uploadImageFile = useCallback(
    async (file: File) => {
      if (disabled || isSourceMode) return;
      setUploadingImage(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(imageUploadEndpoint, {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json().catch(() => null)) as
          | { url?: string; fileUrl?: string; error?: string }
          | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? "Image upload failed");
        }
        const src = sanitizeMediaSrc(payload?.url ?? payload?.fileUrl ?? "");
        if (!src) {
          throw new Error("Image upload returned an invalid URL");
        }
        const alt = (file.name ?? "uploaded image").replace(/"/g, "&quot;");
        insertHtml(`<img src="${src}" alt="${alt}" />`);
      } finally {
        setUploadingImage(false);
      }
    },
    [disabled, imageUploadEndpoint, insertHtml, isSourceMode]
  );

  const uploadImageBatch = useCallback(
    async (files: File[]) => {
      const images = files.filter((file) => file.type.startsWith("image/"));
      if (images.length === 0) return;
      for (const file of images.slice(0, 4)) {
        try {
          await uploadImageFile(file);
        } catch {
          // Keep editor responsive even if one image upload fails.
        }
      }
    },
    [uploadImageFile]
  );

  const insertImage = useCallback(() => {
    const raw = window.prompt("Enter image URL", "https://");
    if (!raw) return;
    const src = sanitizeMediaSrc(raw);
    if (!src) return;
    const alt = window.prompt("Image alt text (optional)", "") ?? "";
    insertHtml(`<img src="${src}" alt="${alt.replace(/"/g, "&quot;")}" />`);
  }, [insertHtml]);

  const insertGraph = useCallback(() => {
    if (disabled || isSourceMode) return;
    const labelsRaw = window.prompt("Graph labels (comma separated)", "Week 1, Week 2, Week 3");
    if (!labelsRaw) return;
    const valuesRaw = window.prompt("Graph values (comma separated)", "12, 20, 16");
    if (!valuesRaw) return;
    const graphTypeRaw = window.prompt("Graph type: bar or line", "bar");
    const graphType = graphTypeRaw?.toLowerCase() === "line" ? "line" : "bar";

    const labels = labelsRaw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 12);
    const values = valuesRaw
      .split(",")
      .map((part) => Number.parseFloat(part.trim()))
      .filter((value) => Number.isFinite(value))
      .slice(0, 12);

    if (labels.length === 0 || values.length === 0) return;
    if (labels.length !== values.length) {
      window.alert("Labels and values must have the same count.");
      return;
    }
    const svg = buildChartSvg(labels, values, graphType);
    const uri = sanitizeMediaSrc(encodeSvgDataUri(svg));
    if (!uri) return;
    insertHtml(`<img src="${uri}" alt="Chart graph" />`);
  }, [disabled, insertHtml, isSourceMode]);

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
      const fileItems = Array.from(event.clipboardData.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file))
        .filter((file) => file.type.startsWith("image/"));
      if (fileItems.length > 0) {
        event.preventDefault();
        void uploadImageBatch(fileItems);
        return;
      }
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
    [disabled, emitChange, isSourceMode, uploadImageBatch]
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (disabled || isSourceMode) return;
      const droppedFiles = Array.from(event.dataTransfer.files ?? []).filter((file) =>
        file.type.startsWith("image/")
      );
      if (droppedFiles.length === 0) return;
      event.preventDefault();
      void uploadImageBatch(droppedFiles);
    },
    [disabled, isSourceMode, uploadImageBatch]
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (disabled || isSourceMode) return;
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
    }
  }, [disabled, isSourceMode]);

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
        <ToolbarButton
          onClick={() => imageFileInputRef.current?.click()}
          disabled={disabled || isSourceMode || uploadingImage}
          title="Upload image"
        >
          <span className="text-[10px] font-semibold">Up</span>
        </ToolbarButton>
        <ToolbarButton onClick={insertTable} disabled={disabled || isSourceMode} title="Insert table"><span className="text-[10px] font-semibold">Tbl</span></ToolbarButton>
        <ToolbarButton onClick={insertGraph} disabled={disabled || isSourceMode} title="Insert graph"><BarChart3 className="h-4 w-4" /></ToolbarButton>
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
        <input
          ref={imageFileInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            void uploadImageBatch(files);
            event.currentTarget.value = "";
          }}
        />
        <ToolbarButton onClick={() => bgColorRef.current?.click()} disabled={disabled || isSourceMode} title="Highlight color"><span className="rounded-sm bg-yellow-300 px-1 text-[10px] font-semibold text-slate-800">ab</span></ToolbarButton>

        <ToolbarButton onClick={() => runCommand("removeFormat")} disabled={disabled || isSourceMode} title="Clear formatting"><Eraser className="h-4 w-4" /></ToolbarButton>

        <div className="ml-auto flex items-center gap-1">
          {uploadingImage ? (
            <span className="text-[10px] font-medium text-[#AA8038]">Uploading image...</span>
          ) : null}
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
            onDrop={onDrop}
            onDragOver={onDragOver}
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
