import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/api-access";
import { loadLeadStageFlow, toLeadStageLabel } from "@/lib/leads";

type OwnerSummary = {
  ownerId: string | null;
  name: string;
  total: number;
  won: number;
};

export async function GET() {
  const accessResult = await requireModuleAccess("leads", "manage");
  if (!accessResult.ok) return accessResult.response;

  try {
    const [stageFlow, leads] = await Promise.all([
      loadLeadStageFlow(),
      prisma.lead.findMany({
        select: {
          id: true,
          stage: true,
          status: true,
          title: true,
          companyName: true,
          source: true,
          priority: true,
          expectedDeposit: true,
          createdAt: true,
          updatedAt: true,
          closedAt: true,
          ownerId: true,
          owner: { select: { id: true, fullname: true, name: true } },
        },
      }),
    ]);

    const total = leads.length;
    const open = leads.filter((l) => l.status === "open").length;
    const won = leads.filter((l) => l.status === "won").length;
    const lost = leads.filter((l) => l.status === "lost").length;
    const archived = leads.filter((l) => l.status === "archived").length;

    const convertedBase = won + lost;
    const conversionRate = convertedBase > 0 ? (won / convertedBase) * 100 : 0;

    const wonLeads = leads.filter((l) => l.status === "won");
    const avgDaysToWin =
      wonLeads.length > 0
        ? wonLeads.reduce((sum, l) => {
            const closeDate = l.closedAt ?? l.updatedAt;
            return sum + (closeDate.getTime() - l.createdAt.getTime()) / 86400000;
          }, 0) / wonLeads.length
        : 0;

    // Pipeline value (open leads with expectedDeposit)
    const pipelineValue = leads
      .filter((l) => l.status === "open" && l.expectedDeposit)
      .reduce((sum, l) => sum + Number(l.expectedDeposit), 0);

    // Stage breakdown
    const stageCount = new Map<string, number>();
    for (const lead of leads) {
      const key = lead.stage || "new";
      stageCount.set(key, (stageCount.get(key) ?? 0) + 1);
    }
    const orderedStages = Array.from(new Set([...stageFlow, "lost", "archived", ...Array.from(stageCount.keys())]));
    const stageBreakdown = orderedStages
      .map((stage) => {
        const count = stageCount.get(stage) ?? 0;
        return { stage, label: toLeadStageLabel(stage), count, share: total > 0 ? (count / total) * 100 : 0 };
      })
      .filter((item) => item.count > 0);

    // Source breakdown
    const sourceCount = new Map<string, number>();
    for (const lead of leads) {
      const src = lead.source?.trim() || "Unknown";
      sourceCount.set(src, (sourceCount.get(src) ?? 0) + 1);
    }
    const sourceBreakdown = Array.from(sourceCount.entries())
      .map(([source, count]) => ({ source, count, share: total > 0 ? (count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Priority breakdown
    const priorityCount = new Map<string, number>();
    for (const lead of leads) {
      const p = lead.priority || "normal";
      priorityCount.set(p, (priorityCount.get(p) ?? 0) + 1);
    }
    const priorityBreakdown = ["high", "normal", "low"].map((p) => ({
      priority: p,
      count: priorityCount.get(p) ?? 0,
    }));

    // Monthly stats: last 6 months (new leads + won leads)
    const now = new Date();
    const monthlyStats: Array<{ month: string; label: string; newLeads: number; wonLeads: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const label = date.toLocaleString("default", { month: "short", year: "2-digit" });
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const newLeads = leads.filter((l) => l.createdAt >= date && l.createdAt < nextDate).length;
      const wonLeadsThisMonth = leads.filter((l) => l.status === "won" && l.updatedAt >= date && l.updatedAt < nextDate).length;
      monthlyStats.push({ month: monthKey, label, newLeads, wonLeads: wonLeadsThisMonth });
    }

    // Owner breakdown
    const ownerMap = new Map<string, OwnerSummary>();
    for (const lead of leads) {
      const key = lead.ownerId ?? "unassigned";
      const current = ownerMap.get(key) ?? {
        ownerId: lead.ownerId,
        name: lead.owner?.fullname?.trim() || lead.owner?.name || "Unassigned",
        total: 0,
        won: 0,
      };
      current.total += 1;
      if (lead.status === "won") current.won += 1;
      ownerMap.set(key, current);
    }

    const ownerBreakdown = Array.from(ownerMap.values())
      .map((item) => ({ ...item, conversionRate: item.total > 0 ? (item.won / item.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);

    const recentWon = leads
      .filter((l) => l.status === "won")
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 10)
      .map((l) => ({
        id: l.id,
        title: l.title,
        companyName: l.companyName,
        owner: l.owner?.fullname?.trim() || l.owner?.name || "Unassigned",
        updatedAt: l.updatedAt.toISOString(),
      }));

    return NextResponse.json({
      summary: { total, open, won, lost, archived, conversionRate, avgDaysToWin, pipelineValue },
      stageBreakdown,
      sourceBreakdown,
      priorityBreakdown,
      ownerBreakdown,
      monthlyStats,
      recentWon,
    });
  } catch (error) {
    console.error("[GET /api/leads/reports]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
