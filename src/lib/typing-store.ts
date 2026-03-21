// In-memory typing state (single process — fine for single-server dev/prod)
type TypingEntry = { userId: string; name: string; expiresAt: number };

const store = new Map<string, Map<string, TypingEntry>>();

export function setTyping(dialogId: string, userId: string, name: string, ttlMs = 4000) {
  if (!store.has(dialogId)) store.set(dialogId, new Map());
  store.get(dialogId)!.set(userId, { userId, name, expiresAt: Date.now() + ttlMs });
}

export function clearTyping(dialogId: string, userId: string) {
  store.get(dialogId)?.delete(userId);
}

export function getTypers(dialogId: string, excludeUserId?: string): string[] {
  const map = store.get(dialogId);
  if (!map) return [];
  const now = Date.now();
  const names: string[] = [];
  for (const [uid, entry] of map) {
    if (entry.expiresAt < now) { map.delete(uid); continue; }
    if (uid === excludeUserId) continue;
    names.push(entry.name);
  }
  return names;
}
