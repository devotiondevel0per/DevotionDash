import type { BoardTopic, Prisma } from "@prisma/client";
import type { AccessContext } from "@/lib/api-access";

export const BOARD_VISIBILITIES = [
  "public",
  "organization",
  "team",
  "private",
] as const;

export type BoardVisibility = (typeof BOARD_VISIBILITIES)[number];

export function normalizeBoardVisibility(
  value: unknown,
  fallback: BoardVisibility = "organization"
): BoardVisibility {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "public") return "public";
  if (normalized === "organization") return "organization";
  if (normalized === "team") return "team";
  if (normalized === "private") return "private";
  return fallback;
}

export function getTeamIdsFromAccess(ctx: AccessContext): string[] {
  return ctx.access.roles.map((role) => role.groupId).filter(Boolean);
}

export function canManageBoardContent(ctx: AccessContext): boolean {
  return ctx.access.isAdmin || ctx.access.permissions.board.manage;
}

export function buildBoardReadFilter(ctx: AccessContext): Prisma.BoardTopicWhereInput {
  if (canManageBoardContent(ctx)) {
    return {};
  }

  const teamIds = getTeamIdsFromAccess(ctx);
  const orFilters: Prisma.BoardTopicWhereInput[] = [
    { visibility: "public" },
    { visibility: "organization" },
    { creatorId: ctx.userId },
  ];

  if (teamIds.length > 0) {
    orFilters.push({
      visibility: "team",
      teamId: { in: teamIds },
    });
  }

  return { OR: orFilters };
}

export function canReadBoardTopic(
  topic: Pick<BoardTopic, "visibility" | "creatorId" | "teamId">,
  ctx: AccessContext
): boolean {
  if (canManageBoardContent(ctx)) return true;
  if (topic.creatorId === ctx.userId) return true;

  const visibility = normalizeBoardVisibility(topic.visibility);
  if (visibility === "public" || visibility === "organization") return true;
  if (visibility === "team") {
    const teamIds = getTeamIdsFromAccess(ctx);
    return Boolean(topic.teamId && teamIds.includes(topic.teamId));
  }

  return false;
}

export function canModifyBoardTopic(
  topic: Pick<BoardTopic, "creatorId">,
  ctx: AccessContext
): boolean {
  return canManageBoardContent(ctx) || topic.creatorId === ctx.userId;
}

