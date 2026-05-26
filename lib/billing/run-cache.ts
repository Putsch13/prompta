/**
 * Cache court TTL pour runs identiques (économie API en mode crédits).
 */

import { createHash } from "crypto";

interface CacheEntry {
  output: string;
  costCents: number;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;

export function runCacheKey(parts: Record<string, string | number>): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function getCachedRun(key: string): { output: string; costCents: number } | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return { output: entry.output, costCents: entry.costCents };
}

export function setCachedRun(key: string, output: string, costCents: number): void {
  if (cache.size >= MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { output, costCents, expiresAt: Date.now() + TTL_MS });
}
