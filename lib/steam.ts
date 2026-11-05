import "server-only";
import { cacheGet, cacheSet } from "./cache-store";
import { logDebug, sanitizeDebugError, sanitizeDebugText } from "./debug";
import { loadWithCacheAndDedupe } from "./cached-dedupe.ts";
import {
  OWNED_TTL_MS,
  appDetailsCacheKey,
  appDetailsCacheTtl,
  ownedCacheKey,
  steamAppDetailsConcurrency,
  steamAppDetailsFallbackEnabled,
  steamAppDetailsFallbackTimeoutMs,
  steamAppDetailsMinIntervalMs,
  steamAppDetailsTimeoutMs,
  steamFetchTimeoutMs,
} from "./steam-core.ts";

const API = "https://api.steampowered.com";
const STORE = "https://store.steampowered.com";

export interface PlayerSummary {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatarfull: string;
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
  genres?: { type: string; description: string }[];
  release_date?: { date: string; coming_soon: boolean };
}

const pendingOwned = new Map<string, Promise<OwnedGame[]>>();
export type AppDetailsPriority = "normal" | "low";

const pendingAppDetails = new Map<string, Promise<AppDetails | null>>();
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

async function fetchAppDetails(appid: number, priority: AppDetailsPriority = "normal"): Promise<AppDetails | null> {
  const startedAt = Date.now();
  const finish = (details: AppDetails | null): AppDetails | null => {
    logDebug("steam.appdetails.finished", {
      appid,
      ms: Date.now() - startedAt,
      ok: details !== null,
    });
    return details;
  };

  const params = new URLSearchParams({
    appids: String(appid),
    filters: "basic,release_date",
    l: "en",
  });
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
      logDebug("steam.appdetails.unsuccessful", { appid, success: entry?.success === true });
    } finally {
      release();
    }
  } catch (error) {
    primaryErrorText = sanitizeDebugError(error);
    logDebug("steam.appdetails.primary_failed", {
      appid,
      error: primaryErrorText,
    });
  }

  if (!steamAppDetailsFallbackEnabled()) return finish(null);

  const fallbackTimeoutMs = steamAppDetailsFallbackTimeoutMs();
  const ccParams = new URLSearchParams(params);
  ccParams.set("cc", "us");
  const ccUrl = `${STORE}/api/appdetails?${ccParams}`;
  const preferPrimaryRetry = /timeout|aborted|fetch failed|network/i.test(primaryErrorText);
  const fallbackAttempts = preferPrimaryRetry
    ? [
        { url: primaryUrl, timeoutMs: fallbackTimeoutMs },
        { url: ccUrl, timeoutMs: fallbackTimeoutMs },
      ]
    : [
        { url: ccUrl, timeoutMs: fallbackTimeoutMs },
        { url: primaryUrl, timeoutMs: fallbackTimeoutMs },
      ];

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
        logDebug("steam.appdetails.fallback_unsuccessful", {
          appid,
          success: fallbackEntry?.success === true,
        });
      } finally {
        release();
      }
    } catch (fallbackError) {
      logDebug("steam.appdetails.fallback_failed", {
        appid,
        error: sanitizeDebugError(fallbackError),
      });
    }
  }

  return finish(null);
}

async function loadAppDetails(appid: number, priority: AppDetailsPriority = "normal"): Promise<AppDetails | null> {
  return loadWithCacheAndDedupe({
    cacheKey: appDetailsCacheKey(appid),
    pending: pendingAppDetails,
    factory: () => fetchAppDetails(appid, priority),
    ttlMs: appDetailsCacheTtl,
    cacheGet,
    cacheSet,
  });
}

export async function getAppDetails(
  appids: number[],
  options: { concurrency?: number; limit?: number; priority?: AppDetailsPriority } = {}
): Promise<Map<number, AppDetails | null>> {
  const out = new Map<number, AppDetails | null>();
  const ids = Array.from(new Set(appids.filter((id) => Number.isFinite(id))));
  const limit = options.limit ?? ids.length;
  const targets = ids.slice(0, Math.max(0, limit));
  const concurrency = Math.max(1, Math.min(options.concurrency ?? steamAppDetailsConcurrency(), 10));
  const priority = options.priority ?? "normal";
  let cursor = 0;

  logDebug("steam.getAppDetails.start", {
    total: ids.length,
    requested: targets.length,
    concurrency,
    priority,
  });

  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const id = targets[cursor++];
      const cached = await loadAppDetails(id, priority);
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

export function extractSteamIdFromOpenId(claimedId: string): string | null {
  const m = claimedId.match(/\/id\/(\d{17})$/) || claimedId.match(/(\d{17})$/);
  return m ? m[1] : null;
}

export { STORE as STEAM_STORE_BASE, API as STEAM_API_BASE };
