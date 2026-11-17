import "server-only";
import { cacheGet, cacheSet, deleteCacheByExactOrPrefix } from "./cache-store";
import { logDebug, sanitizeDebugError, sanitizeDebugText } from "./debug";
import { loadWithCacheAndDedupe } from "./cached-dedupe.ts";
import {
  configureAppDetailsRetry,
  enqueueAppDetailsRetry,
  type AppDetailsRetryOutcome,
  type AppDetailsRetryRequest,
} from "./app-details-retry.ts";
import { UPCOMING_CACHE_PREFIX } from "./aggregate-cache.ts";
import { normalizeSteamStoreCc } from "./store-cc.ts";
import { WISHLIST_CACHE_PREFIX } from "./wishlist-cache-core.ts";
import type { SteamPriceOverview } from "./types";
import {
  appDetailsCacheKey,
  appDetailsCacheTtl,
  APP_DETAILS_TRANSIENT_MISS,
  isTransientAppDetailsCache,
  normalizeSteamProfileAvatar,
  normalizeSteamProfileDisplayName,
  ownedCacheKey,
  OWNED_TTL_MS,
  parseSteamProfileHtml,
  steamAppDetailsConcurrency,
  steamAppDetailsDownloadParams,
  steamAppDetailsFallbackEnabled,
  steamAppDetailsFallbackTimeoutMs,
  steamAppDetailsDebugParamsEnabled,
  steamAppDetailsMaxAttempts,
  steamAppDetailsMinIntervalMs,
  steamAppDetailsRetryEnabled,
  steamAppDetailsTimeoutMs,
  steamFetchTimeoutMs,
  steamProfileCacheKey,
  steamProfileCacheTtl,
  steamProfileTimeoutMs,
  type AppDetailsTransientMiss,
  type SteamProfile,
} from "./steam-core.ts";

const API = "https://api.steampowered.com";
const STORE = "https://store.steampowered.com";

export interface PlayerSummary {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatarfull: string;
  avatarmedium?: string;
  avataricon?: string;
  communityvisibilitystate: number;
  personastate: number;
}

export interface OwnedGame {
  appid: number;
  name: string;
  playtime_forever: number;
  time_created?: number;
  has_community_visible_stats?: boolean;
}

export interface AppDetails {
  name: string;
  type?: string;
  is_free?: boolean;
  developer?: string[];
  publisher?: string[];
  header_image?: string;
  genres?: { id?: string; type?: string; description: string }[];
  release_date?: { date: string; coming_soon: boolean };
  fullgame?: { appid: string | number; name?: string };
  price_overview?: SteamPriceOverview;
}

const pendingOwned = new Map<string, Promise<OwnedGame[]>>();
export type AppDetailsPriority = "normal" | "low";

const pendingAppDetails = new Map<string, Promise<AppDetails | null | AppDetailsTransientMiss>>();
let nextAppDetailsRequestAtMs = 0;
let activeAppDetailsFetches = 0;
let activeLowAppDetailsFetches = 0;
const pendingNormalAppDetailsFetchSlots: Array<() => void> = [];
const pendingLowAppDetailsFetchSlots: Array<() => void> = [];

async function acquireAppDetailsFetchSlot(priority: AppDetailsPriority = "normal"): Promise<() => void> {
  const max = steamAppDetailsConcurrency();
  const lowMax = Math.max(1, Math.min(3, max));
  const pending = priority === "low" ? pendingLowAppDetailsFetchSlots : pendingNormalAppDetailsFetchSlots;
  while (
    activeAppDetailsFetches >= max ||
    (priority === "low" && activeLowAppDetailsFetches >= lowMax)
  ) {
    await new Promise<void>((resolve) => {
      pending.push(resolve);
    });
  }

  activeAppDetailsFetches += 1;
  if (priority === "low") activeLowAppDetailsFetches += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeAppDetailsFetches -= 1;
    if (priority === "low") activeLowAppDetailsFetches -= 1;
    const next = pendingNormalAppDetailsFetchSlots.shift() ?? pendingLowAppDetailsFetchSlots.shift();
    if (next) next();
  };
}

async function jsonFetch(url: string, timeoutMs = steamFetchTimeoutMs()): Promise<unknown> {
  let status: number | undefined;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "SteamCalendarCompanion/1.0",
        Accept: "application/json,text/plain,*/*",
      },
    });
    status = res.status;
    if (!res.ok) throw new Error(`Steam API ${res.status}: ${sanitizeDebugText(url)}`);
    return res.json();
  } catch (error) {
    const safeMessage = sanitizeDebugError(error);
    logDebug("steam.jsonFetch.failed", { status, url: sanitizeDebugText(url), error: safeMessage });
    throw new Error(safeMessage);
  }
}

export async function getPlayerSummaries(steamIds: string[], key?: string): Promise<PlayerSummary[]> {
  const params = new URLSearchParams({ steamids: steamIds.join(",") });
  if (key) params.set("key", key);
  const data = (await jsonFetch(`${API}/ISteamUser/GetPlayerSummaries/v2/?${params}`)) as {
    response?: { players?: PlayerSummary[] };
  };
  return data?.response?.players ?? [];
}

const pendingProfile = new Map<string, Promise<SteamProfile>>();

export async function getSteamProfile(steamId: string, key?: string): Promise<SteamProfile> {
  return loadWithCacheAndDedupe({
    cacheKey: steamProfileCacheKey(steamId),
    pending: pendingProfile,
    cacheGet,
    cacheSet,
    factory: () => fetchSteamProfile(steamId, key),
    ttlMs: steamProfileCacheTtl,
  });
}

async function fetchSteamProfile(steamId: string, key?: string): Promise<SteamProfile> {
  if (key) {
    try {
      const summaries = await getPlayerSummaries([steamId], key);
      const summary = summaries[0];
      const profile: SteamProfile = {
        displayName: normalizeSteamProfileDisplayName(summary?.personaname),
        avatar: normalizeSteamProfileAvatar(summary?.avatarfull ?? summary?.avatarmedium ?? summary?.avataricon),
      };

      if (profile.displayName || profile.avatar) {
        logDebug("steam.profile.api_loaded", {
          hasSteamId: true,
          hasKey: true,
          hasAvatar: Boolean(profile.avatar),
          hasDisplayName: Boolean(profile.displayName),
        });
        return profile;
      }

      logDebug("steam.profile.api_empty", {
        hasSteamId: true,
        hasKey: true,
        playerCount: summaries.length,
      });
    } catch (error) {
      logDebug("steam.profile.api_failed", {
        hasSteamId: true,
        hasKey: true,
        error: sanitizeDebugError(error),
      });
    }
  }

  try {
    const html = await fetchSteamProfileHtml(steamId);
    const profile = parseSteamProfileHtml(html);
    if (profile.displayName || profile.avatar) {
      logDebug("steam.profile.html_loaded", {
        hasSteamId: true,
        hasKey: Boolean(key),
        hasAvatar: Boolean(profile.avatar),
        hasDisplayName: Boolean(profile.displayName),
      });
      return profile;
    }

    logDebug("steam.profile.html_empty", {
      hasSteamId: true,
      hasKey: Boolean(key),
      htmlLength: html.length,
    });
  } catch (error) {
    logDebug("steam.profile.html_failed", {
      hasSteamId: true,
      hasKey: Boolean(key),
      error: sanitizeDebugError(error),
    });
  }

  return {};
}

async function fetchSteamProfileHtml(steamId: string): Promise<string> {
  if (!/^\d{15,20}$/.test(steamId)) throw new Error("Invalid SteamID64");

  const url = `https://steamcommunity.com/profiles/${encodeURIComponent(steamId)}`;
  let status: number | undefined;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(steamProfileTimeoutMs()),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en",
      },
    });
    status = res.status;
    if (!res.ok) throw new Error(`Steam profile ${status}: ${sanitizeDebugText(url)}`);
    return await res.text();
  } catch (error) {
    const safeMessage = sanitizeDebugError(error);
    logDebug("steam.htmlFetch.failed", {
      status,
      url: sanitizeDebugText(url),
      error: safeMessage,
    });
    throw new Error(safeMessage);
  }
}

export async function getOwnedGames(
  steamId: string,
  key: string,
  cachedKeyHash?: string
): Promise<OwnedGame[]> {
  return loadWithCacheAndDedupe({
    cacheKey: ownedCacheKey(steamId, key, cachedKeyHash),
    pending: pendingOwned,
    factory: () => fetchOwnedGames(steamId, key),
    ttlMs: OWNED_TTL_MS,
    cacheGet,
    cacheSet,
  });
}

async function fetchOwnedGames(steamId: string, key: string): Promise<OwnedGame[]> {
  const startedAt = Date.now();
  const params = new URLSearchParams({
    key,
    steamid: steamId,
    include_all_appids: "1",
    include_played_free_games: "1",
  });
  const data = (await jsonFetch(`${API}/IPlayerService/GetOwnedGames/v1/?${params}`)) as {
    response?: { games?: Partial<OwnedGame>[] };
  };
  const out: OwnedGame[] = [];
  for (const g of data?.response?.games ?? []) {
    if (!g) continue;
    const appid = Number(g.appid);
    if (!Number.isFinite(appid) || appid <= 0) continue;
    out.push({
      appid,
      name: g.name || `Steam App ${appid}`,
      playtime_forever: Number(g.playtime_forever ?? 0),
      time_created: typeof g.time_created === "number" ? g.time_created : undefined,
      has_community_visible_stats: g.has_community_visible_stats,
    });
  }

  logDebug("steam.ownedGames.loaded", {
    count: out.length,
    ms: Date.now() - startedAt,
  });
  return out;
}

function isTransientAppDetailsFetchError(error: unknown): boolean {
  return /timeout|aborted|fetch failed|network|\b(?:429|500|502|503|504)\b/i.test(sanitizeDebugError(error));
}

async function reserveAppDetailsRequestSlot(appid: number): Promise<void> {
  const minIntervalMs = steamAppDetailsMinIntervalMs();
  if (minIntervalMs <= 0) return;

  const now = Date.now();
  const waitMs = Math.max(0, nextAppDetailsRequestAtMs - now);
  const reservedAt = now + waitMs;
  nextAppDetailsRequestAtMs = reservedAt + minIntervalMs;

  if (waitMs > 0) {
    logDebug("steam.appdetails.paced", { appid, waitMs });
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

async function fetchAppDetails(
  appid: number,
  priority: AppDetailsPriority = "normal",
  storeCc?: string | null
): Promise<AppDetails | null | AppDetailsTransientMiss> {
  const startedAt = Date.now();
  let sawTransientFetchFailure = false;
  let sawConfirmedNegative = false;
  const finish = (
    details: AppDetails | null | AppDetailsTransientMiss
  ): AppDetails | null | AppDetailsTransientMiss => {
    const transient = isTransientAppDetailsCache(details);
    logDebug("steam.appdetails.finished", {
      appid,
      ms: Date.now() - startedAt,
      ok: details !== null && !transient,
      transient,
    });
    return details;
  };

  const normalizedStoreCc = normalizeSteamStoreCc(storeCc);
  const params = new URLSearchParams({
    appids: String(appid),
    filters: "basic,genres,release_date,price_overview",
    l: "en",
  });
  if (normalizedStoreCc) params.set("cc", normalizedStoreCc);
  const primaryUrl = `${STORE}/api/appdetails?${params}`;
  let primaryErrorText = "";

  try {
    await reserveAppDetailsRequestSlot(appid);
    const release = await acquireAppDetailsFetchSlot(priority);
    try {
      const data = (await jsonFetch(
        primaryUrl,
        steamAppDetailsTimeoutMs()
      )) as Record<string, { success?: boolean; data?: AppDetails }>;
      const entry = data?.[String(appid)];
      if (entry?.success && entry.data) return finish(entry.data);
      sawConfirmedNegative = true;
      logDebug("steam.appdetails.unsuccessful", { appid, success: entry?.success === true });
    } finally {
      release();
    }
  } catch (error) {
    primaryErrorText = sanitizeDebugError(error);
    sawTransientFetchFailure = isTransientAppDetailsFetchError(error);
    logDebug("steam.appdetails.primary_failed", {
      appid,
      error: primaryErrorText,
    });
  }

  if (!steamAppDetailsFallbackEnabled()) {
    return finish(sawTransientFetchFailure && !sawConfirmedNegative ? APP_DETAILS_TRANSIENT_MISS : null);
  }

  const fallbackTimeoutMs = steamAppDetailsFallbackTimeoutMs();
  const preferPrimaryRetry = /timeout|aborted|fetch failed|network/i.test(primaryErrorText);
  const fallbackAttempts = normalizedStoreCc
    ? [{ url: primaryUrl, timeoutMs: fallbackTimeoutMs }]
    : (() => {
        const ccParams = new URLSearchParams(params);
        ccParams.set("cc", "us");
        const ccUrl = `${STORE}/api/appdetails?${ccParams}`;
        return preferPrimaryRetry
          ? [
              { url: primaryUrl, timeoutMs: fallbackTimeoutMs },
              { url: ccUrl, timeoutMs: fallbackTimeoutMs },
            ]
          : [
              { url: ccUrl, timeoutMs: fallbackTimeoutMs },
              { url: primaryUrl, timeoutMs: fallbackTimeoutMs },
            ];
      })();

  for (const attempt of fallbackAttempts) {
    try {
      await reserveAppDetailsRequestSlot(appid);
      const release = await acquireAppDetailsFetchSlot(priority);
      try {
        const fallbackData = (await jsonFetch(
          attempt.url,
          attempt.timeoutMs
        )) as Record<string, { success?: boolean; data?: AppDetails }>;
        const fallbackEntry = fallbackData?.[String(appid)];
        if (fallbackEntry?.success && fallbackEntry.data) return finish(fallbackEntry.data);
        sawConfirmedNegative = true;
        logDebug("steam.appdetails.fallback_unsuccessful", {
          appid,
          success: fallbackEntry?.success === true,
        });
      } finally {
        release();
      }
    } catch (fallbackError) {
      sawTransientFetchFailure = sawTransientFetchFailure || isTransientAppDetailsFetchError(fallbackError);
      logDebug("steam.appdetails.fallback_failed", {
        appid,
        error: sanitizeDebugError(fallbackError),
      });
    }
  }

  return finish(sawTransientFetchFailure && !sawConfirmedNegative ? APP_DETAILS_TRANSIENT_MISS : null);
}

function normalizeSteamId(steamId?: string | null): string | undefined {
  if (typeof steamId !== "string") return undefined;
  const normalized = steamId.trim();
  if (!normalized || !/^\d{15,20}$/.test(normalized)) return undefined;
  return normalized;
}

async function loadAppDetailsRaw(
  appid: number,
  priority: AppDetailsPriority = "normal",
  storeCc?: string | null
): Promise<AppDetails | null | AppDetailsTransientMiss> {
  const normalizedStoreCc = normalizeSteamStoreCc(storeCc);
  return loadWithCacheAndDedupe({
    cacheKey: appDetailsCacheKey(appid, normalizedStoreCc),
    pending: pendingAppDetails,
    factory: () => fetchAppDetails(appid, priority, normalizedStoreCc),
    ttlMs: appDetailsCacheTtl,
    cacheGet,
    cacheSet,
  });
}

async function retryAppDetails(request: AppDetailsRetryRequest): Promise<AppDetailsRetryOutcome> {
  const details = await loadAppDetailsRaw(request.appid, "low", request.storeCc);
  return isTransientAppDetailsCache(details) ? "retry" : "succeeded";
}

async function onAppDetailsRetrySucceeded(request: AppDetailsRetryRequest): Promise<void> {
  const steamId = normalizeSteamId(request.steamId);
  if (!steamId) return;

  await Promise.all([
    deleteCacheByExactOrPrefix(`${UPCOMING_CACHE_PREFIX}${steamId}`),
    deleteCacheByExactOrPrefix(`${WISHLIST_CACHE_PREFIX}${steamId}`),
  ]);
  logDebug("steam.appdetails.retry_succeeded", { appid: request.appid, hasSteamId: true });
}

export function configureSteamAppDetailsRetry(): void {
  configureAppDetailsRetry({
    retry: retryAppDetails,
    onSucceeded: onAppDetailsRetrySucceeded,
  });
}

function scheduleAppDetailsRetry(request: AppDetailsRetryRequest): void {
  if (!steamAppDetailsRetryEnabled()) return;
  enqueueAppDetailsRetry(request);
}

async function loadAppDetails(
  appid: number,
  priority: AppDetailsPriority = "normal",
  storeCc?: string | null,
  steamId?: string | null
): Promise<AppDetails | null> {
  const normalizedStoreCc = normalizeSteamStoreCc(storeCc);
  const details = await loadAppDetailsRaw(appid, priority, normalizedStoreCc);

  if (isTransientAppDetailsCache(details)) {
    const normalizedSteamId = normalizeSteamId(steamId);
    if (priority !== "low" && normalizedSteamId) {
      scheduleAppDetailsRetry({
        appid,
        storeCc: normalizedStoreCc,
        steamId: normalizedSteamId,
      });
    }
    return null;
  }

  return details;
}

export async function getAppDetails(
  appids: number[],
  options: {
    concurrency?: number;
    limit?: number;
    priority?: AppDetailsPriority;
    storeCc?: string | null;
    steamId?: string | null;
  } = {}
): Promise<Map<number, AppDetails | null>> {
  const out = new Map<number, AppDetails | null>();
  const ids = Array.from(new Set(appids.filter((id) => Number.isFinite(id))));
  const limit = options.limit ?? ids.length;
  const targets = ids.slice(0, Math.max(0, limit));
  const concurrency = Math.max(1, Math.min(options.concurrency ?? steamAppDetailsConcurrency(), 10));
  const priority = options.priority ?? "normal";
  const normalizedStoreCc = normalizeSteamStoreCc(options.storeCc);
  const normalizedSteamId = normalizeSteamId(options.steamId);
  const maxAttempts = steamAppDetailsMaxAttempts(normalizedStoreCc);
  const downloadParams = steamAppDetailsDebugParamsEnabled() ? steamAppDetailsDownloadParams() : undefined;
  let cursor = 0;

  logDebug("steam.getAppDetails.start", {
    total: ids.length,
    requested: targets.length,
    concurrency,
    priority,
    hasStoreCc: Boolean(normalizedStoreCc),
    hasSteamId: Boolean(normalizedSteamId),
    maxAttempts,
    downloadParams,
  });

  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const id = targets[cursor++];
      const cached = await loadAppDetails(id, priority, normalizedStoreCc, normalizedSteamId);
      out.set(id, cached);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, targets.length)) }, () => worker())
  );

  logDebug("steam.getAppDetails.done", {
    requested: targets.length,
    missing: Array.from(out.values()).filter((entry) => entry === null).length,
  });

  return out;
}

configureSteamAppDetailsRetry();

export function extractSteamIdFromOpenId(claimedId: string): string | null {
  const m = claimedId.match(/\/id\/(\d{17})\/?$/) || claimedId.match(/(\d{17})\/?$/);
  return m ? m[1] : null;
}

export { STORE as STEAM_STORE_BASE, API as STEAM_API_BASE };
