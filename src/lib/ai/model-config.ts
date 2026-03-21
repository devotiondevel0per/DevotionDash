import { prisma } from "@/lib/prisma";

const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
const CACHE_TTL_MS = 30_000;

let cachedModel = DEFAULT_OLLAMA_MODEL;
let cachedAt = 0;

export async function getOllamaModel() {
  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS) return cachedModel;

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "ai.model" },
      select: { value: true },
    });
    const value = setting?.value?.trim();
    cachedModel = value || DEFAULT_OLLAMA_MODEL;
  } catch {
    cachedModel = DEFAULT_OLLAMA_MODEL;
  }

  cachedAt = now;
  return cachedModel;
}

export function invalidateOllamaModelCache(nextModel?: string | null) {
  cachedAt = 0;
  cachedModel = nextModel?.trim() || DEFAULT_OLLAMA_MODEL;
}
