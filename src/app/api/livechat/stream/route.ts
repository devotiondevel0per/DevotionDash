import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import { prisma } from "@/lib/prisma";
import { buildLiveChatVisibilityWhere, canAccessLiveChatDialog } from "@/lib/livechat-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseChunk(event: string, payload: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("livechat", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const dialogId = req.nextUrl.searchParams.get("dialog")?.trim() || null;

    if (dialogId) {
      const dialog = await prisma.chatDialog.findUnique({
        where: { id: dialogId },
        select: {
          id: true,
          isExternal: true,
          members: { select: { userId: true } },
        },
      });
      if (!dialog || !dialog.isExternal) {
        return NextResponse.json({ error: "Dialog not found" }, { status: 404 });
      }
      const memberIds = dialog.members.map((member) => member.userId);
      if (!canAccessLiveChatDialog(accessResult.ctx.access, accessResult.ctx.userId, memberIds)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const visibilityWhere = buildLiveChatVisibilityWhere(
      accessResult.ctx.access,
      accessResult.ctx.userId
    );

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let latestDialogAt = 0;
        let latestMessageAt = 0;
        let lastDialogId = "";
        let lastMessageId = "";

        const close = () => {
          if (closed) return;
          closed = true;
          clearInterval(pollInterval);
          clearInterval(pingInterval);
          clearTimeout(expireTimeout);
          try {
            controller.close();
          } catch {
            // stream already closed
          }
        };

        const send = (event: string, payload: Record<string, unknown>) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(sseChunk(event, payload)));
          } catch {
            close();
          }
        };

        const poll = async () => {
          try {
            if (dialogId) {
              const [dialog, latestMessage] = await Promise.all([
                prisma.chatDialog.findFirst({
                  where: {
                    id: dialogId,
                    isExternal: true,
                    ...visibilityWhere,
                  },
                  select: { id: true, status: true, updatedAt: true },
                }),
                prisma.chatMessage.findFirst({
                  where: {
                    dialogId,
                    dialog: {
                      isExternal: true,
                      ...visibilityWhere,
                    },
                  },
                  orderBy: { createdAt: "desc" },
                  select: { id: true, createdAt: true },
                }),
              ]);

              if (!dialog) {
                send("forbidden", { reason: "dialog_not_visible" });
                close();
                return;
              }

              const dialogAt = dialog.updatedAt.getTime();
              const messageAt = latestMessage?.createdAt.getTime() ?? 0;
              const changed =
                dialogAt > latestDialogAt ||
                messageAt > latestMessageAt ||
                (latestMessage?.id ?? "") !== lastMessageId;

              if (changed) {
                latestDialogAt = dialogAt;
                latestMessageAt = messageAt;
                lastDialogId = dialog.id;
                lastMessageId = latestMessage?.id ?? "";
                send("sync", {
                  dialogId: dialog.id,
                  status: dialog.status,
                  updatedAt: dialog.updatedAt.toISOString(),
                  latestMessageAt: latestMessage?.createdAt.toISOString() ?? null,
                });
              }

              return;
            }

            const [latestDialog, latestMessage] = await Promise.all([
              prisma.chatDialog.findFirst({
                where: {
                  isExternal: true,
                  ...visibilityWhere,
                },
                orderBy: { updatedAt: "desc" },
                select: { id: true, status: true, updatedAt: true },
              }),
              prisma.chatMessage.findFirst({
                where: {
                  dialog: {
                    isExternal: true,
                    ...visibilityWhere,
                  },
                },
                orderBy: { createdAt: "desc" },
                select: { id: true, dialogId: true, createdAt: true },
              }),
            ]);

            const dialogAt = latestDialog?.updatedAt.getTime() ?? 0;
            const messageAt = latestMessage?.createdAt.getTime() ?? 0;
            const changed =
              dialogAt > latestDialogAt ||
              messageAt > latestMessageAt ||
              (latestDialog?.id ?? "") !== lastDialogId ||
              (latestMessage?.id ?? "") !== lastMessageId;

            if (changed) {
              latestDialogAt = dialogAt;
              latestMessageAt = messageAt;
              lastDialogId = latestDialog?.id ?? "";
              lastMessageId = latestMessage?.id ?? "";
              send("sync", {
                dialogId: latestDialog?.id ?? latestMessage?.dialogId ?? null,
                status: latestDialog?.status ?? null,
                updatedAt: latestDialog?.updatedAt.toISOString() ?? null,
                latestMessageAt: latestMessage?.createdAt.toISOString() ?? null,
              });
            }
          } catch {
            send("error", { reason: "poll_failed" });
          }
        };

        send("ready", {
          serverTime: new Date().toISOString(),
          mode: dialogId ? "dialog" : "global",
          dialogId,
        });

        void poll();

        const pollInterval = setInterval(() => {
          void poll();
        }, 3000);

        const pingInterval = setInterval(() => {
          send("ping", { ts: Date.now() });
        }, 15000);

        const expireTimeout = setTimeout(() => {
          close();
        }, 55_000);

        req.signal.addEventListener("abort", () => {
          close();
        });
      },
      cancel() {
        // no-op, handled by abort callback
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[GET /api/livechat/stream]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
