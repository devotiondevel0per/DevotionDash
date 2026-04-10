import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import { requireModuleAccess } from "@/lib/api-access";

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "projects", "forms");

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "text/",
  "application/pdf",
  "application/msword",
  "application/vnd.",
  "application/zip",
  "application/x-zip",
  "application/x-rar",
  "application/x-7z",
  "application/json",
  "application/xml",
  "application/octet-stream",
];

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("projects", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_SIZE / 1024 / 1024} MB)` },
        { status: 400 }
      );
    }

    const mime = file.type || "application/octet-stream";
    if (!isAllowedMime(mime)) {
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }

    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = safeName.includes(".") ? safeName.split(".").pop()! : "";
    const uuid = crypto.randomUUID();
    const filename = ext ? `${uuid}.${ext}` : uuid;
    const filepath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    return NextResponse.json(
      {
        url: `/uploads/projects/forms/${filename}`,
        fileName: file.name,
        size: file.size,
        mimeType: mime,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/projects/uploads]", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
