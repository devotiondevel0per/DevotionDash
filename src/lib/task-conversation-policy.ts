import { prisma } from "@/lib/prisma";

export const TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES_KEY =
  "tasks.conversation.authorEditDeleteWindowMinutes";
export const DEFAULT_TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES = 5;
export const MIN_TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES = 1;
export const MAX_TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES = 1440;

const CACHE_TTL_MS = 30_000;

let cachedValue = DEFAULT_TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES;
let cachedAt = 0;

export function normalizeTaskConversationAuthorEditWindowMinutes(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.min(
      MAX_TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES,
      Math.max(MIN_TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES, Math.round(input))
    );
  }

  const parsed = Number.parseInt(String(input ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES;
  }

  return Math.min(
    MAX_TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES,
    Math.max(MIN_TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES, parsed)
  );
}

export async function getTaskConversationAuthorEditWindowMinutes() {
  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS) return cachedValue;

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES_KEY },
      select: { value: true },
    });
    cachedValue = normalizeTaskConversationAuthorEditWindowMinutes(setting?.value);
  } catch {
    cachedValue = DEFAULT_TASK_CONVERSATION_AUTHOR_EDIT_WINDOW_MINUTES;
  }

  cachedAt = now;
  return cachedValue;
}

export function invalidateTaskConversationPolicyCache(nextValue?: number | null) {
  cachedAt = 0;
  if (typeof nextValue === "number" && Number.isFinite(nextValue)) {
    cachedValue = normalizeTaskConversationAuthorEditWindowMinutes(nextValue);
  }
}

export function isWithinAuthorConversationWindow(
  createdAt: Date,
  windowMinutes: number,
  nowMs = Date.now()
) {
  const windowMs = Math.max(0, windowMinutes) * 60 * 1000;
  return nowMs - createdAt.getTime() <= windowMs;
}
