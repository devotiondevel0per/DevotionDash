import { prisma } from "@/lib/prisma";
import { buildUserAccess } from "@/lib/rbac";
import type { LiveChatRoutingStrategy } from "@/lib/livechat-settings";

export type EligibleLiveChatAgent = {
  id: string;
  name: string;
  openLoad: number;
};

function displayName(user: { name: string; fullname: string; surname: string }) {
  return user.fullname || [user.name, user.surname].filter(Boolean).join(" ").trim() || "Unknown";
}

export async function listEligibleLiveChatAgents(maxOpenPerAgent: number): Promise<EligibleLiveChatAgent[]> {
  const [users, assignments] = await Promise.all([
    prisma.user.findMany({
      where: {
        isActive: true,
        workState: 1,
        // Prefer online agents; away agents are included as fallback
        agentStatus: { in: ["online", "away"] },
      },
      orderBy: [
        { agentStatus: "asc" }, // "away" sorts after "online" alphabetically, we want online first
        { fullname: "asc" },
        { name: "asc" },
      ],
      select: {
        id: true,
        name: true,
        fullname: true,
        surname: true,
        workState: true,
        agentStatus: true,
      },
    }),
    prisma.chatDialogMember.findMany({
      where: { dialog: { isExternal: true, status: "open" } },
      select: { userId: true },
    }),
  ]);

  const loadByUserId = assignments.reduce((acc, row) => {
    acc.set(row.userId, (acc.get(row.userId) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  const accessRows = await Promise.all(
    users.map(async (user) => ({
      user,
      access: await buildUserAccess(user.id),
    }))
  );

  return accessRows
    .filter(
      (row) => Boolean(row.access?.permissions.livechat.write || row.access?.permissions.livechat.manage)
    )
    .map((row) => ({
      id: row.user.id,
      name: displayName(row.user),
      openLoad: loadByUserId.get(row.user.id) ?? 0,
    }))
    .filter((row) => row.openLoad < maxOpenPerAgent);
}

export function pickLiveChatAgent(
  strategy: LiveChatRoutingStrategy,
  agents: EligibleLiveChatAgent[],
  lastAssignedAgentId: string | null
): EligibleLiveChatAgent | null {
  if (agents.length === 0) return null;

  if (strategy === "round_robin") {
    const ordered = [...agents].sort((a, b) => a.name.localeCompare(b.name));
    const lastIndex = ordered.findIndex((row) => row.id === lastAssignedAgentId);
    const nextIndex = lastIndex >= 0 ? (lastIndex + 1) % ordered.length : 0;
    return ordered[nextIndex] ?? ordered[0] ?? null;
  }

  const ordered = [...agents].sort((a, b) => {
    if (a.openLoad !== b.openLoad) return a.openLoad - b.openLoad;
    return a.name.localeCompare(b.name);
  });
  return ordered[0] ?? null;
}
