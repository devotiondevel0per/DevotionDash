type DialogMemberLike = {
  userId: string;
  user?: {
    name?: string | null;
    fullname?: string | null;
  } | null;
};

type DialogLike = {
  subject?: string | null;
  groupId?: string | null;
  organizationId?: string | null;
  isExternal?: boolean | null;
  updatedAt?: Date | string | null;
  members: DialogMemberLike[];
  messages?: unknown[] | null;
};

function normalizeSubjectValue(subject?: string | null) {
  const value = subject?.trim();
  return value ? value : null;
}

export function isSyntheticDirectDialogSubject(
  subject?: string | null,
  members: DialogMemberLike[] = []
) {
  const normalized = normalizeSubjectValue(subject);
  if (!normalized) return false;

  const lower = normalized.toLowerCase();
  if (lower === "direct" || lower === "direct chat") return true;
  if (!lower.startsWith("direct:")) return false;

  const suffix = normalized.slice(normalized.indexOf(":") + 1).trim().toLowerCase();
  if (!suffix) return true;

  const knownNames = new Set(
    members
      .flatMap((member) => [member.user?.fullname, member.user?.name])
      .map((value) => value?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))
  );

  return knownNames.size === 0 || knownNames.has(suffix);
}

export function getCanonicalDialogSubject(
  subject: string | null | undefined,
  members: DialogMemberLike[]
) {
  const normalized = normalizeSubjectValue(subject);
  if (!normalized) return null;
  return isSyntheticDirectDialogSubject(normalized, members) ? null : normalized;
}

function uniqueSortedMemberIds(members: DialogMemberLike[]) {
  return Array.from(
    new Set(
      members
        .map((member) => member.userId)
        .filter((userId): userId is string => Boolean(userId))
    )
  ).sort();
}

function directDialogPriority(dialog: DialogLike) {
  let score = 0;
  const normalizedSubject = normalizeSubjectValue(dialog.subject);

  if (!normalizedSubject) score += 3;
  else if (isSyntheticDirectDialogSubject(normalizedSubject, dialog.members)) score += 1;

  if ((dialog.messages?.length ?? 0) > 0) score += 2;

  return score;
}

function updatedAtMs(dialog: DialogLike) {
  const value = dialog.updatedAt;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function compareDirectDialogs(a: DialogLike, b: DialogLike) {
  const scoreDiff = directDialogPriority(a) - directDialogPriority(b);
  if (scoreDiff !== 0) return scoreDiff;
  return updatedAtMs(a) - updatedAtMs(b);
}

export function getDirectDialogKey(dialog: DialogLike) {
  if (dialog.isExternal) return null;
  if (dialog.groupId || dialog.organizationId) return null;

  const memberIds = uniqueSortedMemberIds(dialog.members);
  if (memberIds.length !== 2) return null;

  const subject = getCanonicalDialogSubject(dialog.subject, dialog.members);
  if (subject) return null;

  return memberIds.join(":");
}

export function isMalformedDirectDialog(dialog: DialogLike) {
  if (dialog.isExternal) return false;
  if (dialog.groupId || dialog.organizationId) return false;

  const memberIds = uniqueSortedMemberIds(dialog.members);
  if (memberIds.length > 1) return false;

  const subject = getCanonicalDialogSubject(dialog.subject, dialog.members);
  return !subject;
}

export function withCanonicalDialogSubject<T extends { subject?: string | null; members: DialogMemberLike[] }>(
  dialog: T
) {
  const subject = getCanonicalDialogSubject(dialog.subject, dialog.members);
  if (subject === dialog.subject) return dialog;
  return {
    ...dialog,
    subject,
  };
}
