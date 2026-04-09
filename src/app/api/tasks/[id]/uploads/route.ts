import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { canCurrentUserCommentOnTask, loadTaskCommentAccessInfo } from "@/lib/task-access";

export const runtime = "nodejs";

const MAX_FILES_PER_UPLOAD = 8;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function isMissingTaskCommentColumn(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    const meta = (error.meta ?? {}) as Record<string, unknown>;
    const column = String(meta.column ?? meta.field_name ?? "");
    if (column.toLowerCase().includes("taskcommentid")) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /taskcommentid/i.test(message) && /(unknown column|doesn't exist|p2022|not found)/i.test(message);
}

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
  const accessResult = await requireModuleAccess("tasks", "read");
  if (!accessResult.ok) return accessResult.response;

  const { id } = await params;

  try {
    const taskAccess = await loadTaskCommentAccessInfo(
      prisma,
      id,
      accessResult.ctx.userId
    );
    if (!taskAccess) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const commentIdRaw = formData.get("commentId");
    const commentId =
      typeof commentIdRaw === "string" && commentIdRaw.trim().length > 0
        ? commentIdRaw.trim()
        : null;

    const canManageTasks = accessResult.ctx.access.isAdmin || accessResult.ctx.access.permissions.tasks.manage;
    const canWriteTasks = canManageTasks || accessResult.ctx.access.permissions.tasks.write;
    const canComment = canCurrentUserCommentOnTask(
      taskAccess,
      accessResult.ctx.userId,
      accessResult.ctx.access
    );

    if (commentId) {
      if (!canComment) {
        return NextResponse.json(
          { error: "You can view this task, but commenting is disabled for your assignment" },
          { status: 403 }
        );
      }

      const comment = await prisma.taskComment.findUnique({
        where: { id: commentId },
        select: { id: true, taskId: true, userId: true },
      });
      if (!comment || comment.taskId !== id) {
        return NextResponse.json({ error: "Comment not found for this task" }, { status: 404 });
      }
      if (!canManageTasks && comment.userId !== accessResult.ctx.userId) {
        return NextResponse.json(
          { error: "You can attach files only to your own comments" },
          { status: 403 }
        );
      }
    } else if (!canWriteTasks) {
      return NextResponse.json(
        { error: "Forbidden: missing tasks.write permission" },
        { status: 403 }
      );
    }

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
      const baseData = {
        fileName: safeOriginalName,
        fileUrl,
        fileSize: file.size,
        mimeType,
        taskId: id,
      };
      let attachment;
      try {
        attachment = await prisma.attachment.create({
          data: {
            ...baseData,
            ...(commentId ? { taskCommentId: commentId } : {}),
          },
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            fileSize: true,
            mimeType: true,
            createdAt: true,
          },
        });
      } catch (error) {
        if (!(commentId && isMissingTaskCommentColumn(error))) throw error;
        attachment = await prisma.attachment.create({
          data: baseData,
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            fileSize: true,
            mimeType: true,
            createdAt: true,
          },
        });
      }

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
