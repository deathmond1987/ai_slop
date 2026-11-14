import { keyHash } from "./key-hash.ts";
import { normalizeSteamStoreCc } from "./store-cc.ts";

export interface SteamCacheableAppDetails {
  release_date?: { date: string; coming_soon: boolean };
}

export const APP_DETAILS_TRANSIENT_MISS = { transientAppDetails: true } as const;
export type AppDetailsTransientMiss = typeof APP_DETAILS_TRANSIENT_MISS;
export type AppDetailsCacheInput = SteamCacheableAppDetails | null | AppDetailsTransientMiss;

export const APP_DETAILS_TTL_MS = 6 * 60 * 60 * 1000;
export const APP_DETAILS_NEGATIVE_TTL_MS = 5 * 60 * 1000;
export const APP_DETAILS_VOLATILE_TTL_MS = 15 * 60 * 1000;
export const APP_DETAILS_CACHE_PREFIX = "appdetails:";
export const OWNED_CACHE_PREFIX = "owned:";
export const OWNED_TTL_MS = 10 * 60 * 1000;
export const STEAM_PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
export const STEAM_PROFILE_NEGATIVE_TTL_MS = 30 * 60 * 1000;
export const STEAM_PROFILE_CACHE_PREFIX = "steamprofile:";
export const STEAM_FETCH_TIMEOUT_MS = 15000;
export const STEAM_PROFILE_TIMEOUT_MS = 8000;
export const STEAM_APPDETAILS_TIMEOUT_MS = 10000;
export const STEAM_APPDETAILS_FALLBACK_TIMEOUT_MS = 6000;
export const STEAM_APPDETAILS_CONCURRENCY = 8;
export const STEAM_APPDETAILS_MIN_INTERVAL_MS = 100;
export const STEAM_APPDETAILS_MIN_INTERVAL_MAX_MS = 5000;
export const STEAM_APPDETAILS_RETRY_DEFAULT_ENABLED = true;
export const STEAM_APPDETAILS_RETRY_DELAY_MS = 30_000;
export const STEAM_APPDETAILS_RETRY_MAX_ATTEMPTS = 2;
export const STEAM_APPDETAILS_RETRY_QUEUE_MAX = 500;
export const STEAM_APPDETAILS_RETRY_STEAM_IDS_MAX = 20;

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

export function steamAppDetailsRetryEnabled(): boolean {
  return parseBoolean(process.env.STEAM_APPDETAILS_RETRY, STEAM_APPDETAILS_RETRY_DEFAULT_ENABLED);
}

export function steamAppDetailsRetryDelayMs(): number {
  return parsePositiveInt(process.env.STEAM_APPDETAILS_RETRY_DELAY_MS, STEAM_APPDETAILS_RETRY_DELAY_MS);
}

export function steamAppDetailsRetryMaxAttempts(): number {
  const maxAttempts = parsePositiveInt(
    process.env.STEAM_APPDETAILS_RETRY_MAX_ATTEMPTS,
    STEAM_APPDETAILS_RETRY_MAX_ATTEMPTS
  );
  return Math.max(1, Math.min(maxAttempts, 5));
}

export function steamAppDetailsRetryQueueMax(): number {
  const queueMax = parsePositiveInt(process.env.STEAM_APPDETAILS_RETRY_QUEUE_MAX, STEAM_APPDETAILS_RETRY_QUEUE_MAX);
  return Math.max(1, Math.min(queueMax, 2000));
}

export function steamAppDetailsRetrySteamIdsMax(): number {
  const steamIdsMax = parsePositiveInt(
    process.env.STEAM_APPDETAILS_RETRY_STEAM_IDS_MAX,
    STEAM_APPDETAILS_RETRY_STEAM_IDS_MAX
  );
  return Math.max(1, Math.min(steamIdsMax, 100));
}

export function steamAppDetailsMaxAttempts(storeCc?: string | null | undefined): number {
  if (!steamAppDetailsFallbackEnabled()) return 1;
  return normalizeSteamStoreCc(storeCc) ? 2 : 3;
}

export function steamAppDetailsDebugParamsEnabled(): boolean {
  return parseBoolean(process.env.DOWNLOAD_PARAMS_DEBUG, parseBoolean(process.env.APP_DEBUG, false));
}

export interface SteamAppDetailsDownloadParams {
  concurrency: number;
  timeoutMs: number;
  fallbackEnabled: boolean;
  fallbackTimeoutMs: number;
  minIntervalMs: number;
  minIntervalMaxMs: number;
  maxAttemptsWhenStoreCcPresent: number;
  maxAttemptsWhenStoreCcMissing: number;
  negativeTtlMs: number;
  volatileTtlMs: number;
  retryEnabled: boolean;
  retryDelayMs: number;
  retryMaxAttempts: number;
  retryQueueMax: number;
  retrySteamIdsMax: number;
  debugEnabled: boolean;
}

export function steamAppDetailsDownloadParams(): SteamAppDetailsDownloadParams {
  const fallbackEnabled = steamAppDetailsFallbackEnabled();
  const maxAttemptsWhenStoreCcPresent = fallbackEnabled ? 2 : 1;
  const maxAttemptsWhenStoreCcMissing = fallbackEnabled ? 3 : 1;

  return {
    concurrency: steamAppDetailsConcurrency(),
    timeoutMs: steamAppDetailsTimeoutMs(),
    fallbackEnabled,
    fallbackTimeoutMs: steamAppDetailsFallbackTimeoutMs(),
    minIntervalMs: steamAppDetailsMinIntervalMs(),
    minIntervalMaxMs: STEAM_APPDETAILS_MIN_INTERVAL_MAX_MS,
    maxAttemptsWhenStoreCcPresent,
    maxAttemptsWhenStoreCcMissing,
    negativeTtlMs: APP_DETAILS_NEGATIVE_TTL_MS,
    volatileTtlMs: APP_DETAILS_VOLATILE_TTL_MS,
    retryEnabled: steamAppDetailsRetryEnabled(),
    retryDelayMs: steamAppDetailsRetryDelayMs(),
    retryMaxAttempts: steamAppDetailsRetryMaxAttempts(),
    retryQueueMax: steamAppDetailsRetryQueueMax(),
    retrySteamIdsMax: steamAppDetailsRetrySteamIdsMax(),
    debugEnabled: steamAppDetailsDebugParamsEnabled(),
  };
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
  return `${OWNED_CACHE_PREFIX}${steamId}:${steamApiKeyHash(key, cachedKeyHash)}`;
}

export function appDetailsCacheKey(
  appid: number,
  storeCc?: string | null | undefined
): string {
  const normalizedStoreCc = normalizeSteamStoreCc(storeCc);
  if (!normalizedStoreCc) return `${APP_DETAILS_CACHE_PREFIX}${appid}`;
  return `${APP_DETAILS_CACHE_PREFIX}${appid}:${normalizedStoreCc}`;
}

export function isTransientAppDetailsCache(value: unknown): value is AppDetailsTransientMiss {
  return value === APP_DETAILS_TRANSIENT_MISS;
}

export function appDetailsCacheTtl(details: AppDetailsCacheInput): number {
  if (isTransientAppDetailsCache(details)) return 0;
  if (!details) return APP_DETAILS_NEGATIVE_TTL_MS;
  const release = details.release_date;
  if (!release) return APP_DETAILS_TTL_MS;
  if (release.coming_soon || isVolatileSteamReleaseDate(release.date)) {
    return APP_DETAILS_VOLATILE_TTL_MS;
  }
  return APP_DETAILS_TTL_MS;
}

export function steamProfileTimeoutMs(): number {
  return parsePositiveInt(process.env.STEAM_PROFILE_TIMEOUT_MS, STEAM_PROFILE_TIMEOUT_MS);
}

export interface SteamProfile {
  displayName?: string;
  avatar?: string;
}

export function steamProfileCacheKey(steamId: string): string {
  return `${STEAM_PROFILE_CACHE_PREFIX}${steamId}`;
}

export function steamProfileCacheTtl(profile: SteamProfile | null): number {
  return profile && (profile.displayName || profile.avatar) ? STEAM_PROFILE_TTL_MS : STEAM_PROFILE_NEGATIVE_TTL_MS;
}

const STEAM_AVATAR_HOSTS = new Set([
  "avatars.akamai.steamstatic.com",
  "avatars.fastly.steamstatic.com",
  "community.akamai.steamstatic.com",
  "community.cloudflare.steamstatic.com",
]);

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function normalizeSteamProfileAvatar(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return undefined;
    if (!STEAM_AVATAR_HOSTS.has(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function normalizeSteamProfileDisplayName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const decoded = decodeHtmlEntities(value).trim();
  if (!decoded) return undefined;

  const match = decoded.match(/^steam community\s*::\s*(.+)$/i);
  const name = (match?.[1] ?? decoded).trim();
  if (
    !name ||
    /^steam community$/i.test(name) ||
    /^sign in$/i.test(name) ||
    /^private$/i.test(name)
  ) {
    return undefined;
  }
  return name.slice(0, 120);
}

export function parseSteamProfileHtml(html: string): SteamProfile {
  return {
    displayName: normalizeSteamProfileDisplayName(getOpenGraphMeta(html, "og:title")),
    avatar: normalizeSteamProfileAvatar(getOpenGraphMeta(html, "og:image")),
  };
}

function getOpenGraphMeta(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]*content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*property=["']${escaped}["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, name: string) => {
    const key = name.toLowerCase();
    const named = HTML_ENTITIES[key];
    if (named) return named;

    if (key.startsWith("#x")) {
      const codePoint = Number.parseInt(key.slice(2), 16);
      return safeCodePoint(codePoint);
    }

    if (key.startsWith("#")) {
      const codePoint = Number.parseInt(key.slice(1), 10);
      return safeCodePoint(codePoint);
    }

    return entity;
  });
}

function safeCodePoint(codePoint: number): string {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return "";
  return String.fromCodePoint(codePoint);
}
