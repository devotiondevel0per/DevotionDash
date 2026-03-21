import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";

export const runtime = "nodejs";

const MAX_FILES_PER_UPLOAD = 8;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function sanitizeFileName(name: string): string {
  const normalized = name.trim().replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-");
  if (normalized.length === 0) return `attachment-${Date.now()}`;
  return normalized.slice(0, 120);
}

function normalizeMime(file: File, safeName: string): string {
  if (file.type?.trim()) return file.type.trim();
  const ext = path.extname(safeName).toLowerCase();
  if ([".png"].includes(ext)) return "image/png";
  if ([".jpg", ".jpeg"].includes(ext)) return "image/jpeg";
  if ([".gif"].includes(ext)) return "image/gif";
  if ([".webp"].includes(ext)) return "image/webp";
  if ([".svg"].includes(ext)) return "image/svg+xml";
  if ([".pdf"].includes(ext)) return "application/pdf";
  if ([".txt"].includes(ext)) return "text/plain";
  if ([".doc", ".docx"].includes(ext)) return "application/msword";
  if ([".xls", ".xlsx"].includes(ext)) return "application/vnd.ms-excel";
  return "application/octet-stream";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessResult = await requireModuleAccess("tasks", "write");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;

  try {
    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const formData = await req.formData();
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => typeof entry === "object" && entry instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    if (files.length > MAX_FILES_PER_UPLOAD) {
      return NextResponse.json(
        { error: `You can upload up to ${MAX_FILES_PER_UPLOAD} files at once` },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "tasks", id);
    await mkdir(uploadDir, { recursive: true });

    const uploaded = [];
    for (const file of files) {
      if (file.size <= 0) return NextResponse.json({ error: "One of the files is empty" }, { status: 400 });
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `Each file must be <= ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB` },
          { status: 400 }
        );
      }

      const safeOriginalName = sanitizeFileName(file.name);
      const storedName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeOriginalName}`;
      const absolutePath = path.join(uploadDir, storedName);
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(absolutePath, bytes);

      const fileUrl = `/uploads/tasks/${id}/${storedName}`;
      const mimeType = normalizeMime(file, safeOriginalName);
      const attachment = await prisma.attachment.create({
        data: {
          fileName: safeOriginalName,
          fileUrl,
          fileSize: file.size,
          mimeType,
          taskId: id,
        },
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          fileSize: true,
          mimeType: true,
        },
      });

      uploaded.push({
        ...attachment,
        isImage: mimeType.startsWith("image/"),
      });
    }

    return NextResponse.json({ files: uploaded }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/tasks/[id]/uploads]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

