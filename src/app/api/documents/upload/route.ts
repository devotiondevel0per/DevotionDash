import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import { requireModuleAccess } from "@/lib/api-access";
import { prisma } from "@/lib/prisma";

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "documents");

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
  const accessResult = await requireModuleAccess("documents", "write");
  if (!accessResult.ok) return accessResult.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folderId = formData.get("folderId") as string | null;
    const accessLevel = (formData.get("accessLevel") as string | null) ?? "module";

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

    // Ensure upload dir exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    // Generate a safe filename
    const originalName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = originalName.includes(".") ? originalName.split(".").pop()! : "";
    const uuid = crypto.randomUUID();
    const filename = ext ? `${uuid}.${ext}` : uuid;
    const filepath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    const fileUrl = `/uploads/documents/${filename}`;

    // Create document record in DB
    const doc = await prisma.document.create({
      data: {
        name: file.name,
        fileUrl,
        fileSize: file.size,
        mimeType: mime,
        folderId: folderId || null,
        accessLevel: accessLevel === "private" ? "private" : "module",
        ownerId: accessResult.ctx.userId,
      },
      include: {
        owner: { select: { id: true, name: true, fullname: true } },
        folder: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    console.error("[POST /api/documents/upload]", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
