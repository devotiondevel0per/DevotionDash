import type { Prisma } from "@prisma/client";
import type { UserAccess } from "@/lib/rbac";

export function canManageLiveChat(access: UserAccess) {
  return access.permissions.livechat.manage;
}

export function canWriteLiveChat(access: UserAccess) {
  return access.permissions.livechat.write || access.permissions.livechat.manage;
}

export function buildLiveChatVisibilityWhere(
  access: UserAccess,
  userId: string
): Prisma.ChatDialogWhereInput {
  if (canManageLiveChat(access)) {
    return {};
  }

  if (canWriteLiveChat(access)) {
    return {
      OR: [{ members: { some: { userId } } }, { members: { none: {} } }],
    };
  }

  return { members: { some: { userId } } };
}

export function canAccessLiveChatDialog(
  access: UserAccess,
  userId: string,
  memberUserIds: string[]
) {
  if (canManageLiveChat(access)) return true;
  if (memberUserIds.includes(userId)) return true;
  return canWriteLiveChat(access) && memberUserIds.length === 0;
}
