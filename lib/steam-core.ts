import { keyHash } from "./key-hash.ts";

export interface SteamCacheableAppDetails {
  release_date?: { date: string; coming_soon: boolean };
}

export const APP_DETAILS_TTL_MS = 6 * 60 * 60 * 1000;
export const APP_DETAILS_NEGATIVE_TTL_MS = 5 * 60 * 1000;
export const APP_DETAILS_VOLATILE_TTL_MS = 15 * 60 * 1000;
export const APP_DETAILS_CACHE_PREFIX = "appdetails:";
export const OWNED_TTL_MS = 10 * 60 * 1000;
export const STEAM_FETCH_TIMEOUT_MS = 10000;

const YEAR_ONLY_RE = /^\d{4}$/;
const YEAR_MONTH_RE = /^\d{4}-\d{2}$/;
const PLACEHOLDER_YEAR_END_RE = /^\d{4}-12-31$/;

function isVolatileSteamReleaseDate(date: string): boolean {
  const value = date.trim();
  return YEAR_ONLY_RE.test(value) || YEAR_MONTH_RE.test(value) || PLACEHOLDER_YEAR_END_RE.test(value);
}

export function steamApiKeyHash(key: string, cached?: string): string {
  return keyHash(key, cached);
}

export function ownedCacheKey(steamId: string, key: string, cachedKeyHash?: string): string {
  return `owned:${steamId}:${steamApiKeyHash(key, cachedKeyHash)}`;
}

export function appDetailsCacheKey(appid: number): string {
  return `${APP_DETAILS_CACHE_PREFIX}${appid}`;
}

export function appDetailsCacheTtl(details: SteamCacheableAppDetails | null): number {
  if (!details) return APP_DETAILS_NEGATIVE_TTL_MS;
  const release = details.release_date;
  if (!release) return APP_DETAILS_TTL_MS;
  if (release.coming_soon || isVolatileSteamReleaseDate(release.date)) {
    return APP_DETAILS_VOLATILE_TTL_MS;
  }
  return APP_DETAILS_TTL_MS;
}
