import { keyHash } from "./key-hash.ts";
import type { RawgHit } from "./types.ts";

export const RAWG_CACHE_PREFIX = "rawg:";
export const RAWG_POSITIVE_TTL_MS = 24 * 60 * 60 * 1000;
export const RAWG_NEGATIVE_TTL_MS = 15 * 60 * 1000;
export const RAWG_FETCH_TIMEOUT_MS = 8000;

export function rawgCacheKey(name: string, key: string, cachedKeyHash?: string): string {
  return `${RAWG_CACHE_PREFIX}${keyHash(key, cachedKeyHash)}:${name.toLowerCase().trim()}`;
}

export function rawgCacheTtl(hit: RawgHit | null): number {
  return hit ? RAWG_POSITIVE_TTL_MS : RAWG_NEGATIVE_TTL_MS;
}
