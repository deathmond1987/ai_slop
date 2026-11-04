import "server-only";
import { cacheGet, cacheSet } from "./cache-store";
import { logDebug, sanitizeDebugError, sanitizeDebugText } from "./debug";
import { loadWithCacheAndDedupe } from "./cached-dedupe.ts";
import {
  OWNED_TTL_MS,
  STEAM_FETCH_TIMEOUT_MS,
  appDetailsCacheKey,
  appDetailsCacheTtl,
  ownedCacheKey,
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
const pendingAppDetails = new Map<string, Promise<AppDetails | null>>();

async function jsonFetch(url: string): Promise<unknown> {
  let status: number | undefined;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(STEAM_FETCH_TIMEOUT_MS),
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

  logDebug("steam.ownedGames.loaded", { count: out.length });
  return out;
}

async function fetchAppDetails(appid: number): Promise<AppDetails | null> {
  const params = new URLSearchParams({
    appids: String(appid),
    filters: "basic,release_date",
    l: "en",
  });

  try {
    const data = (await jsonFetch(`${STORE}/api/appdetails?${params}`)) as Record<
      string,
      { success?: boolean; data?: AppDetails }
    >;
    const entry = data?.[String(appid)];
    if (entry?.success && entry.data) return entry.data;
    logDebug("steam.appdetails.unsuccessful", { appid, success: entry?.success === true });
  } catch (error) {
    logDebug("steam.appdetails.primary_failed", {
      appid,
      error: sanitizeDebugError(error),
    });
  }

  params.set("cc", "us");
  try {
    const fallbackData = (await jsonFetch(`${STORE}/api/appdetails?${params}`)) as Record<
      string,
      { success?: boolean; data?: AppDetails }
    >;
    const fallbackEntry = fallbackData?.[String(appid)];
    if (fallbackEntry?.success && fallbackEntry.data) return fallbackEntry.data;
    logDebug("steam.appdetails.fallback_unsuccessful", {
      appid,
      success: fallbackEntry?.success === true,
    });
  } catch (error) {
    logDebug("steam.appdetails.fallback_failed", {
      appid,
      error: sanitizeDebugError(error),
    });
  }

  return null;
}

async function loadAppDetails(appid: number): Promise<AppDetails | null> {
  return loadWithCacheAndDedupe({
    cacheKey: appDetailsCacheKey(appid),
    pending: pendingAppDetails,
    factory: () => fetchAppDetails(appid),
    ttlMs: appDetailsCacheTtl,
    cacheGet,
    cacheSet,
  });
}

export async function getAppDetails(
  appids: number[],
  options: { concurrency?: number; limit?: number } = {}
): Promise<Map<number, AppDetails | null>> {
  const out = new Map<number, AppDetails | null>();
  const ids = Array.from(new Set(appids.filter((id) => Number.isFinite(id))));
  const limit = options.limit ?? ids.length;
  const targets = ids.slice(0, Math.max(0, limit));
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 10));
  let cursor = 0;

  logDebug("steam.getAppDetails.start", {
    total: ids.length,
    requested: targets.length,
    concurrency,
  });

  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const id = targets[cursor++];
      const cached = await loadAppDetails(id);
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
