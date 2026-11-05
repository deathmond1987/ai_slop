import { keyHash } from "./key-hash.ts";

export interface SteamCacheableAppDetails {
  release_date?: { date: string; coming_soon: boolean };
}

export const APP_DETAILS_TTL_MS = 6 * 60 * 60 * 1000;
export const APP_DETAILS_NEGATIVE_TTL_MS = 5 * 60 * 1000;
export const APP_DETAILS_VOLATILE_TTL_MS = 15 * 60 * 1000;
export const APP_DETAILS_CACHE_PREFIX = "appdetails:";
export const OWNED_TTL_MS = 10 * 60 * 1000;
export const STEAM_FETCH_TIMEOUT_MS = 15000;
export const STEAM_APPDETAILS_TIMEOUT_MS = 10000;
export const STEAM_APPDETAILS_FALLBACK_TIMEOUT_MS = 6000;
export const STEAM_APPDETAILS_CONCURRENCY = 8;
export const STEAM_APPDETAILS_MIN_INTERVAL_MS = 100;
export const STEAM_APPDETAILS_MIN_INTERVAL_MAX_MS = 5000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function steamFetchTimeoutMs(): number {
  return parsePositiveInt(process.env.STEAM_FETCH_TIMEOUT_MS, STEAM_FETCH_TIMEOUT_MS);
}

export function steamAppDetailsTimeoutMs(): number {
  return parsePositiveInt(process.env.STEAM_APPDETAILS_TIMEOUT_MS, STEAM_APPDETAILS_TIMEOUT_MS);
}

export function steamAppDetailsFallbackTimeoutMs(): number {
  return parsePositiveInt(
    process.env.STEAM_APPDETAILS_FALLBACK_TIMEOUT_MS,
    STEAM_APPDETAILS_FALLBACK_TIMEOUT_MS
  );
}

export function steamAppDetailsFallbackEnabled(): boolean {
  return parseBoolean(process.env.STEAM_APPDETAILS_FALLBACK, true);
}

export function steamAppDetailsConcurrency(): number {
  const concurrency = parsePositiveInt(process.env.STEAM_APPDETAILS_CONCURRENCY, STEAM_APPDETAILS_CONCURRENCY);
  return Math.max(1, Math.min(concurrency, 10));
}

export function steamAppDetailsMinIntervalMs(): number {
  const interval = parseNonNegativeInt(
    process.env.STEAM_APPDETAILS_MIN_INTERVAL_MS,
    STEAM_APPDETAILS_MIN_INTERVAL_MS
  );
  return Math.min(interval, STEAM_APPDETAILS_MIN_INTERVAL_MAX_MS);
}

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
