import "server-only";
import { getAppDetails } from "./steam";
import { cacheGet, cacheSet } from "./cache-store";
import { logDebug, sanitizeDebugError } from "./debug";
import type { AppDetails } from "./steam";
import {
  encodeWishlistRequest,
  isPrivateApiResult,
  parseFirstField1Varint,
  parseGetWishlistResponse,
  parseJsonCountResponse,
  parseJsonWishlistResponse,
  parseWishlistPageResult,
} from "./wishlist-core";
import type { ApiWishlistItem, ApiWishlistResult, WishlistItem } from "./wishlist-core";

export type { ApiWishlistItem, ApiWishlistResult, WishlistItem } from "./wishlist-core";

export interface WishlistAppDetailsEntry {
  appid: number;
  details: AppDetails | null;
}

export interface WishlistResult {
  items: WishlistItem[];
  private: boolean;
  totalKnown?: number;
  details?: WishlistAppDetailsEntry[];
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const API_BASE = "https://api.steampowered.com";
const API_ORIGIN = "https://store.steampowered.com";
const MAX_EXTRA_WISHLIST_METADATA = 250;
const WISHLIST_FETCH_TIMEOUT_MS = 10000;

async function fetchWishlistJsonMethod(
  steamId: string,
  method: "GetWishlistItemCount" | "GetWishlist"
): Promise<{ ok: boolean; private: boolean; data: unknown }> {
  try {
    const params = new URLSearchParams({ steamid: steamId });
    const res = await fetch(`${API_BASE}/IWishlistService/${method}/v1?${params}`, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(WISHLIST_FETCH_TIMEOUT_MS),
    });
    const eresultHeader = res.headers.get("x-eresult");
    const eresult = eresultHeader === null ? null : Number(eresultHeader);
    let data: unknown = null;
    try {
      data = await res.json();
    } catch (error) {
      logDebug("wishlist.jsonMethod.json_parse_failed", {
        method,
        status: res.status,
        error: sanitizeDebugError(error),
      });
      data = null;
    }
    return {
      ok: res.ok && data !== null && (eresult === null || eresult === 1),
      private: isPrivateApiResult(res.status, eresult),
      data,
    };
  } catch (error) {
    logDebug("wishlist.jsonMethod.failed", {
      method,
      error: sanitizeDebugError(error),
    });
    return { ok: false, private: false, data: null };
  }
}

async function fetchWishlistApiMethod(
  steamId: string,
  method: "GetWishlistItemCount" | "GetWishlist"
): Promise<{ ok: boolean; private: boolean; body: Buffer }> {
  try {
    const params = new URLSearchParams({
      origin: API_ORIGIN,
      input_protobuf_encoded: encodeWishlistRequest(steamId),
    });
    const res = await fetch(`${API_BASE}/IWishlistService/${method}/v1?${params}`, {
      headers: {
        "User-Agent": UA,
        Accept: "application/octet-stream",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(WISHLIST_FETCH_TIMEOUT_MS),
    });
    const body = Buffer.from(await res.arrayBuffer());
    const eresultHeader = res.headers.get("x-eresult");
    const eresult = eresultHeader === null ? null : Number(eresultHeader);
    return {
      ok: res.ok && eresult === 1,
      private: isPrivateApiResult(res.status, eresult),
      body,
    };
  } catch (error) {
    logDebug("wishlist.protobufMethod.failed", {
      method,
      error: sanitizeDebugError(error),
    });
    return { ok: false, private: false, body: Buffer.alloc(0) };
  }
}

async function fetchWishlistApi(steamId: string): Promise<ApiWishlistResult> {
  const [countJson, listJson] = await Promise.all([
    fetchWishlistJsonMethod(steamId, "GetWishlistItemCount"),
    fetchWishlistJsonMethod(steamId, "GetWishlist"),
  ]);
  const jsonItems = listJson.ok ? parseJsonWishlistResponse(listJson.data) : [];
  const jsonCount = countJson.ok ? parseJsonCountResponse(countJson.data) : null;
  const jsonUsable =
    jsonItems.length > 0 || (countJson.ok && listJson.ok && (jsonCount ?? 0) === 0);

  logDebug("wishlist.jsonResult", {
    jsonItemCount: jsonItems.length,
    jsonCount,
    jsonUsable,
    countOk: countJson.ok,
    listOk: listJson.ok,
    private: countJson.private || listJson.private,
  });

  if (jsonUsable) {
    return {
      ok: listJson.ok,
      private: countJson.private || listJson.private,
      items: jsonItems,
      count: jsonCount ?? (jsonItems.length > 0 ? jsonItems.length : null),
    };
  }

  if (countJson.private || listJson.private) {
    return {
      ok: false,
      private: true,
      items: [],
      count: jsonCount,
    };
  }

  const [countRes, listRes] = await Promise.all([
    fetchWishlistApiMethod(steamId, "GetWishlistItemCount"),
    fetchWishlistApiMethod(steamId, "GetWishlist"),
  ]);
  return {
    ok: listRes.ok,
    private: countRes.private || listRes.private,
    items: listRes.ok ? parseGetWishlistResponse(listRes.body) : [],
    count: countRes.ok ? parseFirstField1Varint(countRes.body) : null,
  };
}

async function finalizeApiWishlist(
  apiItems: ApiWishlistItem[],
  totalCount: number,
  pageItems: WishlistItem[]
): Promise<WishlistResult> {
  const pageMap = new Map<number, WishlistItem>(pageItems.map((item) => [item.appid, item]));
  const enrichAppids = apiItems
    .map((item) => item.appid)
    .filter((appid) => {
      const pageItem = pageMap.get(appid);
      const placeholder = `App ${appid}`;
      if (!pageItem || pageItem.title === placeholder) return true;
      if (!pageItem.coverImage) return true;
      return !pageItem.releaseDateText;
    });
  const details =
    enrichAppids.length > 0
      ? await getAppDetails(enrichAppids, {
          concurrency: 4,
          limit: Math.min(enrichAppids.length, MAX_EXTRA_WISHLIST_METADATA),
        })
      : new Map<number, AppDetails | null>();

  const items = apiItems.map((item) => {
    const pageItem = pageMap.get(item.appid);
    const detail = details.get(item.appid);
    const fallbackTitle = `App ${item.appid}`;
    const title =
      pageItem && pageItem.title && pageItem.title !== fallbackTitle
        ? pageItem.title
        : detail?.name || fallbackTitle;
    return {
      appid: item.appid,
      title,
      coverImage: pageItem?.coverImage || detail?.header_image,
      releaseDateText: pageItem?.releaseDateText || detail?.release_date?.date,
    };
  });

  const detailsEntries: WishlistAppDetailsEntry[] = [];
  for (const [appid, detail] of details) {
    detailsEntries.push({ appid, details: detail });
  }

  return {
    items,
    private: false,
    totalKnown: Math.max(totalCount, items.length) || undefined,
    details: detailsEntries.length > 0 ? detailsEntries : undefined,
  };
}

const WISHLIST_CACHE_TTL_MS = 10 * 60 * 1000;
const WISHLIST_CACHE_PREFIX = "wishlist:v2:";
const pendingWishlist = new Map<string, Promise<WishlistResult>>();

function getCachedWishlist(steamId: string): Promise<WishlistResult | undefined> {
  return cacheGet<WishlistResult>(`${WISHLIST_CACHE_PREFIX}${steamId}`);
}

function setCachedWishlist(steamId: string, result: WishlistResult): Promise<void> {
  return cacheSet(`${WISHLIST_CACHE_PREFIX}${steamId}`, result, WISHLIST_CACHE_TTL_MS);
}

export async function fetchWishlist(steamId: string): Promise<WishlistResult> {
  const cached = await getCachedWishlist(steamId);
  if (cached !== undefined) return cached;

  const inflight = pendingWishlist.get(steamId);
  if (inflight) return inflight;

  const promise = fetchWishlistUncached(steamId).finally(() => {
    pendingWishlist.delete(steamId);
  });
  pendingWishlist.set(steamId, promise);
  const result = await promise;
  await setCachedWishlist(steamId, result);
  return result;
}

async function fetchWishlistUncached(steamId: string): Promise<WishlistResult> {
  const emptyPage: WishlistResult = {
    items: [],
    private: false,
    totalKnown: undefined,
  };

  const api = await fetchWishlistApi(steamId);

  if (api.private && api.items.length === 0) {
    return {
      items: [],
      private: true,
      totalKnown: api.count ?? undefined,
    };
  }

  if (api.items.length > 0) {
    const page = await fetchWishlistFromPage(steamId).catch((error) => {
      logDebug("wishlist.pageFetch.failed", { error: sanitizeDebugError(error) });
      return emptyPage;
    });
    return finalizeApiWishlist(api.items, api.count ?? api.items.length, page.items);
  }

  if (api.ok && (api.count ?? 0) === 0) {
    return { items: [], private: false, totalKnown: 0 };
  }

  const page = await fetchWishlistFromPage(steamId).catch((error) => {
      logDebug("wishlist.pageFetch.failed", { error: sanitizeDebugError(error) });
      return emptyPage;
    });

  if (page.private) {
    return { items: [], private: true, totalKnown: page.totalKnown };
  }

  if (page.items.length === 0 && api.ok && (api.count ?? 0) === 0) {
    return { items: [], private: false, totalKnown: 0 };
  }

  const totalKnown = Math.max(page.totalKnown ?? 0, api.count ?? 0, page.items.length);
  return {
    items: page.items,
    private: page.private,
    totalKnown: totalKnown || undefined,
  };
}

async function fetchWishlistFromPage(steamId: string): Promise<WishlistResult> {
  const url = `https://store.steampowered.com/wishlist/profiles/${encodeURIComponent(steamId)}/`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    cache: "no-store",
    signal: AbortSignal.timeout(WISHLIST_FETCH_TIMEOUT_MS),
  });

  if (res.status === 401 || res.status === 402 || res.status === 403) {
    logDebug("wishlist.pageFetch.private", { status: res.status });
    return { items: [], private: true };
  }

  if (!res.ok) {
    logDebug("wishlist.pageFetch.not_ok", { status: res.status });
    return { items: [], private: false };
  }

  const html = await res.text();
  const page = parseWishlistPageResult(html, steamId);

  return {
    items: page.items,
    private: page.private,
    totalKnown: page.totalKnown,
  };
}

export { parseWishlistDate } from "./wishlist-core";
