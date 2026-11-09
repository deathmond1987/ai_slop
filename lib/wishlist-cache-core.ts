import { shortHash } from "./aggregate-cache.ts";
import { normalizeSteamStoreCc } from "./store-cc.ts";

export const WISHLIST_CACHE_TTL_MS = 10 * 60 * 1000;
export const WISHLIST_CACHE_PREFIX = "wishlist:v2:";

export function wishlistStoreCcHash(storeCc?: string | null): string | undefined {
  const normalizedStoreCc = normalizeSteamStoreCc(storeCc);
  return normalizedStoreCc ? shortHash(normalizedStoreCc) : undefined;
}

export function wishlistCacheKey(steamId: string, storeCcHash?: string): string {
  const base = `${WISHLIST_CACHE_PREFIX}${steamId}`;
  return storeCcHash ? `${base}:${storeCcHash}` : base;
}
