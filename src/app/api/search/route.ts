import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { type ModuleId } from "@/lib/permissions";
import { buildLiveChatVisibilityWhere } from "@/lib/livechat-access";

type SearchResult = {
  id: string;
  module: ModuleId;
  title: string;
  snippet: string;
  date: string;
  link: string;
};

export async function GET(req: NextRequest) {
  const accessResult = await requireModuleAccess("search", "read");
  if (!accessResult.ok) return accessResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") ?? "").trim();
    const moduleFilter = searchParams.get("module")?.trim() as ModuleId | undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

    if (!query) {
      return NextResponse.json({ query, results: [] as SearchResult[] });
    }

    const access = accessResult.ctx.access;
    const userId = accessResult.ctx.userId;
    const userEmail = accessResult.ctx.userEmail?.toLowerCase().trim() ?? null;
    const canRead = (module: ModuleId) => access.isAdmin || access.permissions[module].read;

    const results: SearchResult[] = [];

    if ((!moduleFilter || moduleFilter === "tasks") && canRead("tasks")) {
      const tasks = await prisma.task.findMany({
        where: {
          AND: [
            access.isAdmin
              ? {}
              : {
                  OR: [{ creatorId: userId }, { assignees: { some: { userId } } }],
                },
            { OR: [{ title: { contains: query } }, { description: { contains: query } }] },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      });
      results.push(
        ...tasks.map((task) => ({
          id: task.id,
          module: "tasks" as const,
          title: task.title,
          snippet: (task.description ?? "").slice(0, 180),
          date: task.updatedAt.toISOString(),
          link: "/tasks",
        }))
      );
    }

    if ((!moduleFilter || moduleFilter === "documents") && canRead("documents")) {
      const documents = await prisma.document.findMany({
        where: {
          AND: [
            access.isAdmin
              ? {}
              : {
                  OR: [
                    { ownerId: userId },
                    { shares: { some: { userId, canRead: true } } },
                    { folder: { is: { shares: { some: { userId, canRead: true } } } } },
                  ],
                },
            { OR: [{ name: { contains: query } }, { content: { contains: query } }] },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      });
      results.push(
        ...documents.map((doc) => ({
          id: doc.id,
          module: "documents" as const,
          title: doc.name,
          snippet: (doc.content ?? "").slice(0, 180),
          date: doc.updatedAt.toISOString(),
          link: "/documents",
        }))
      );
    }

    if ((!moduleFilter || moduleFilter === "email") && canRead("email")) {
      const emails = await prisma.email.findMany({
        where: {
          AND: [
            access.isAdmin
              ? {}
              : {
                  OR: [
                    { fromId: userId },
                    { recipients: { some: { userId } } },
                    ...(userEmail ? [{ mailbox: { is: { email: userEmail } } }] : []),
                  ],
                },
            { OR: [{ subject: { contains: query } }, { body: { contains: query } }] },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      results.push(
        ...emails.map((email) => ({
          id: email.id,
          module: "email" as const,
          title: email.subject,
          snippet: (email.body ?? "").slice(0, 180),
          date: email.createdAt.toISOString(),
          link: "/email",
        }))
      );
    }

    if ((!moduleFilter || moduleFilter === "clients") && canRead("clients")) {
      const organizations = await prisma.organization.findMany({
        where: {
          AND: [
            access.isAdmin
              ? {}
              : {
                  OR: [
                    { managerId: userId },
                    { contacts: { some: { createdById: userId } } },
                    { leads: { some: { ownerId: userId } } },
                    {
                      serviceDeskRequests: {
                        some: { OR: [{ requesterId: userId }, { assigneeId: userId }] },
                      },
                    },
                    { chatDialogs: { some: { members: { some: { userId } } } } },
                  ],
                },
            { OR: [{ name: { contains: query } }, { comment: { contains: query } }] },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      });
      results.push(
        ...organizations.map((org) => ({
          id: org.id,
          module: "clients" as const,
          title: org.name,
          snippet: (org.comment ?? "").slice(0, 180),
          date: org.updatedAt.toISOString(),
          link: "/clients",
        }))
      );
    }

    if ((!moduleFilter || moduleFilter === "leads") && canRead("leads")) {
      const leads = await prisma.lead.findMany({
        where: {
          AND: [
            access.isAdmin ? {} : { ownerId: userId },
            {
              OR: [
                { title: { contains: query } },
                { companyName: { contains: query } },
                { contactName: { contains: query } },
                { email: { contains: query } },
                { source: { contains: query } },
                { notes: { contains: query } },
              ],
            },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      });
      results.push(
        ...leads.map((lead) => ({
          id: lead.id,
          module: "leads" as const,
          title: lead.title || lead.companyName,
          snippet: (lead.notes ?? "").slice(0, 180),
          date: lead.updatedAt.toISOString(),
          link: "/leads",
        }))
      );
    }

    if ((!moduleFilter || moduleFilter === "livechat") && canRead("livechat")) {
      const dialogs = await prisma.chatDialog.findMany({
        where: {
          AND: [
            { isExternal: true },
            buildLiveChatVisibilityWhere(access, userId),
            {
              OR: [
                { subject: { contains: query } },
                { visitorName: { contains: query } },
                { visitorEmail: { contains: query } },
              ],
            },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      });
      results.push(
        ...dialogs.map((dialog) => ({
          id: dialog.id,
          module: "livechat" as const,
          title: dialog.subject?.trim() || dialog.visitorName?.trim() || "Live chat session",
          snippet: dialog.visitorEmail?.trim() || "Live chat conversation",
          date: dialog.updatedAt.toISOString(),
          link: "/livechat",
        }))
      );
    }

    const sorted = results.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);

    return NextResponse.json({ query, results: sorted });
  } catch (error) {
    console.error("[GET /api/search]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
