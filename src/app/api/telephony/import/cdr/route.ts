import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";

type ParsedRow = {
  callerNum: string;
  calleeNum: string;
  callerId: string | null;
  calleeId: string | null;
  direction: "inbound" | "outbound" | "internal";
  status: string;
  duration: number;
  startedAt: Date;
  recordUrl: string;
};

const HEADER_ALIASES = {
  caller: ["caller", "from", "src", "source", "callerid", "callernumber", "fromnumber", "fromno", "calling"],
  callee: ["callee", "to", "dst", "destination", "called", "calleenumber", "tonumber", "tono"],
  startedAt: ["start", "started", "startedat", "datetime", "time", "date", "callstart", "starttime"],
  duration: ["duration", "billsec", "seconds", "talktime", "callduration"],
  direction: ["direction", "type", "calltype"],
  status: ["status", "result", "disposition"],
  callerExt: ["callerext", "srcext", "sourceext", "fromext", "extension"],
  calleeExt: ["calleeext", "dstext", "destinationext", "toext"],
} as const;

function normalizePhone(value: string | null | undefined) {
  return (value ?? "").replace(/[^\d+*#A-Za-z]/g, "").trim();
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function detectDelimiter(line: string) {
  const counts = [
    { delimiter: ",", count: (line.match(/,/g) ?? []).length },
    { delimiter: ";", count: (line.match(/;/g) ?? []).length },
    { delimiter: "\t", count: (line.match(/\t/g) ?? []).length },
    { delimiter: "|", count: (line.match(/\|/g) ?? []).length },
  ];
  counts.sort((a, b) => b.count - a.count);
  return counts[0]?.count > 0 ? counts[0].delimiter : ",";
}

function parseCsvLine(line: string, delimiter: string) {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  out.push(current.trim());
  return out.map((cell) => cell.replace(/^"(.*)"$/, "$1").trim());
}

function pickColumnIndex(headers: string[], candidates: readonly string[]) {
  const normalizedCandidates = new Set(candidates.map((item) => normalizeHeader(item)));
  return headers.findIndex((header) => normalizedCandidates.has(normalizeHeader(header)));
}

function parseDuration(value: string) {
  const input = value.trim();
  if (!input) return 0;
  if (/^\d+$/.test(input)) return Math.max(parseInt(input, 10), 0);
  if (!input.includes(":")) return 0;

  const parts = input.split(":").map((part) => parseInt(part, 10));
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return Math.max(parts[0] * 3600 + parts[1] * 60 + parts[2], 0);
  if (parts.length === 2) return Math.max(parts[0] * 60 + parts[1], 0);
  return 0;
}

function parseDateFlex(value: string) {
  const input = value.trim();
  if (!input) return new Date();

  if (/^\d{13}$/.test(input)) {
    const dt = new Date(Number(input));
    return Number.isNaN(dt.getTime()) ? new Date() : dt;
  }
  if (/^\d{10}$/.test(input)) {
    const dt = new Date(Number(input) * 1000);
    return Number.isNaN(dt.getTime()) ? new Date() : dt;
  }

  const jsDate = new Date(input);
  if (!Number.isNaN(jsDate.getTime())) return jsDate;

  const dmy = input.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const hour = Number(dmy[4] ?? "0");
    const minute = Number(dmy[5] ?? "0");
    const second = Number(dmy[6] ?? "0");
    const parsed = new Date(year, month - 1, day, hour, minute, second);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

function mapStatus(input: string) {
  const value = input.toLowerCase();
  if (!value) return "answered";
  if (value.includes("busy")) return "busy";
  if (value.includes("miss") || value.includes("noanswer") || value.includes("unanswer")) return "missed";
  if (value.includes("fail") || value.includes("error") || value.includes("cancel")) return "failed";
  if (value.includes("answer") || value.includes("complete") || value.includes("success")) return "answered";
  return "answered";
}

function mapDirection(
  input: string,
  callerNum: string,
  calleeNum: string,
  extensionToUser: Map<string, string | null>
): "inbound" | "outbound" | "internal" {
  const value = input.toLowerCase();
  if (value.includes("internal")) return "internal";
  if (value.includes("out")) return "outbound";
  if (value.includes("in")) return "inbound";

  const callerKnown = extensionToUser.has(normalizePhone(callerNum));
  const calleeKnown = extensionToUser.has(normalizePhone(calleeNum));
  if (callerKnown && calleeKnown) return "internal";
  if (callerKnown) return "outbound";
  if (calleeKnown) return "inbound";
  return "inbound";
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("telephony", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const form = await req.formData();
    const source = typeof form.get("source") === "string" ? String(form.get("source")).trim() || "manual" : "manual";
    const file = form.get("file");
    const inlineCsv = form.get("csv");

    let csvText = "";
    if (file instanceof File) {
      csvText = await file.text();
    } else if (typeof inlineCsv === "string") {
      csvText = inlineCsv;
    }

    if (!csvText.trim()) {
      return NextResponse.json({ error: "CSV input is required. Upload a file or send `csv` text." }, { status: 400 });
    }

    const lines = csvText
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV must include header and at least one data row." }, { status: 400 });
    }

    const delimiter = detectDelimiter(lines[0]);
    const headers = parseCsvLine(lines[0], delimiter);
    const callerIndex = pickColumnIndex(headers, HEADER_ALIASES.caller);
    const calleeIndex = pickColumnIndex(headers, HEADER_ALIASES.callee);
    const startedAtIndex = pickColumnIndex(headers, HEADER_ALIASES.startedAt);
    const durationIndex = pickColumnIndex(headers, HEADER_ALIASES.duration);
    const directionIndex = pickColumnIndex(headers, HEADER_ALIASES.direction);
    const statusIndex = pickColumnIndex(headers, HEADER_ALIASES.status);
    const callerExtIndex = pickColumnIndex(headers, HEADER_ALIASES.callerExt);
    const calleeExtIndex = pickColumnIndex(headers, HEADER_ALIASES.calleeExt);

    if (callerIndex < 0 || calleeIndex < 0) {
      return NextResponse.json(
        {
          error: "CSV must contain caller and callee columns (e.g. caller/from/src and callee/to/dst).",
        },
        { status: 400 }
      );
    }

    const extensions = await accessResult.ctx.db.extension.findMany({
      select: { number: true, userId: true },
    });
    const extensionToUser = new Map(extensions.map((ext) => [normalizePhone(ext.number), ext.userId] as const));

    const parsedRows: ParsedRow[] = [];
    const warnings: string[] = [];

    for (let i = 1; i < lines.length; i += 1) {
      const row = parseCsvLine(lines[i], delimiter);
      const rawCaller = callerIndex >= 0 ? row[callerIndex] ?? "" : "";
      const rawCallee = calleeIndex >= 0 ? row[calleeIndex] ?? "" : "";
      const callerNum = normalizePhone(rawCaller);
      const calleeNum = normalizePhone(rawCallee);
      if (!callerNum && !calleeNum) continue;

      const callerExt = callerExtIndex >= 0 ? normalizePhone(row[callerExtIndex] ?? "") : "";
      const calleeExt = calleeExtIndex >= 0 ? normalizePhone(row[calleeExtIndex] ?? "") : "";

      const startedAtRaw = startedAtIndex >= 0 ? row[startedAtIndex] ?? "" : "";
      const durationRaw = durationIndex >= 0 ? row[durationIndex] ?? "" : "";
      const directionRaw = directionIndex >= 0 ? row[directionIndex] ?? "" : "";
      const statusRaw = statusIndex >= 0 ? row[statusIndex] ?? "" : "";

      const startedAt = parseDateFlex(startedAtRaw);
      const duration = parseDuration(durationRaw);
      const direction = mapDirection(directionRaw, callerNum, calleeNum, extensionToUser);
      const status = mapStatus(statusRaw);

      const callerId = extensionToUser.get(callerExt || callerNum) ?? null;
      const calleeId = extensionToUser.get(calleeExt || calleeNum) ?? null;

      const fingerprint = createHash("sha1")
        .update(`${source}|${callerNum}|${calleeNum}|${startedAt.toISOString()}|${duration}|${status}|${direction}`)
        .digest("hex");
      const recordUrl = `import:${source}:${fingerprint}`;

      parsedRows.push({
        callerNum: callerNum || "unknown",
        calleeNum: calleeNum || "unknown",
        callerId,
        calleeId,
        direction,
        status,
        duration,
        startedAt,
        recordUrl,
      });
    }

    const deduped = new Map(parsedRows.map((row) => [row.recordUrl, row] as const));
    const keys = [...deduped.keys()];
    if (keys.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0, skipped: 0, totalRows: 0, warnings });
    }

    const existing = await accessResult.ctx.db.callLog.findMany({
      where: { recordUrl: { in: keys } },
      select: { recordUrl: true },
    });
    const existingKeys = new Set(existing.map((row) => row.recordUrl).filter(Boolean) as string[]);

    const toInsert = [...deduped.values()].filter((row) => !existingKeys.has(row.recordUrl));
    if (toInsert.length > 0) {
      await accessResult.ctx.db.callLog.createMany({
        data: toInsert.map((row) => ({
          callerId: row.callerId,
          calleeId: row.calleeId,
          callerNum: row.callerNum,
          calleeNum: row.calleeNum,
          direction: row.direction,
          status: row.status,
          duration: row.duration,
          startedAt: row.startedAt,
          recordUrl: row.recordUrl,
        })),
      });
    }

    return NextResponse.json({
      ok: true,
      source,
      mode: "cdr-csv-import",
      totalRows: parsedRows.length,
      inserted: toInsert.length,
      skipped: parsedRows.length - toInsert.length,
      warnings,
    });
  } catch (error) {
    console.error("[POST /api/telephony/import/cdr]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import CDR CSV" },
      { status: 500 }
    );
  }
}

