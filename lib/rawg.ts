import "server-only";
import { cacheGet, cacheSet } from "./cache-store";
import { logDebug, sanitizeDebugError } from "./debug";
import { loadWithCacheAndDedupe } from "./cached-dedupe.ts";
import {
  RAWG_FETCH_TIMEOUT_MS,
  rawgCacheKey,
  rawgCacheTtl,
} from "./rawg-core.ts";
import type { RawgHit } from "./types";

const BASE = "https://api.rawg.io/api";
const pendingRawg = new Map<string, Promise<RawgHit | null>>();

interface RawgPlatformEntry {
  platform?: { name?: string };
}

interface RawgGameResult {
  name?: string;
  released?: string | null;
  platforms?: RawgPlatformEntry[];
  slug?: string;
}

async function fetchRawg(name: string, key: string): Promise<RawgHit | null> {
  const params = new URLSearchParams({
    key,
    search: name,
    page_size: "5",
    search_source: "name,original_name",
  });

  try {
    const res = await fetch(`${BASE}/games?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(RAWG_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      logDebug("rawg.fetch.not_ok", { search: name, status: res.status });
      return null;
    }

    const data = (await res.json()) as { results?: RawgGameResult[] };
    const results = data?.results ?? [];
    if (!results.length) {
      logDebug("rawg.fetch.no_results", { search: name });
      return null;
    }

    const lowered = name.toLowerCase().trim();
    const pick =
      results.find((r) => (r.name ?? "").toLowerCase() === lowered) ??
      results.find((r) => (r.name ?? "").toLowerCase().includes(lowered)) ??
      results[0];

    const platforms: string[] = (pick.platforms ?? [])
      .map((p) => p.platform?.name)
      .filter((n): n is string => Boolean(n));

    const released: string | null =
      pick.released && /^\d{4}-\d{2}-\d{2}$/.test(pick.released) ? pick.released : null;

    logDebug("rawg.fetch.picked", {
      search: name,
      picked: pick.name,
      slug: pick.slug ?? "",
      hasReleaseDate: released !== null,
    });

    return {
      name: pick.name ?? name,
      released,
      platforms,
      slug: pick.slug ?? "",
    };
  } catch (error) {
    logDebug("rawg.fetch.failed", {
      search: name,
      error: sanitizeDebugError(error),
    });
    return null;
  }
}

export async function searchRawg(
  name: string,
  key: string,
  cachedKeyHash?: string
): Promise<RawgHit | null> {
  return loadWithCacheAndDedupe({
    cacheKey: rawgCacheKey(name, key, cachedKeyHash),
    pending: pendingRawg,
    factory: () => fetchRawg(name, key),
    ttlMs: rawgCacheTtl,
    cacheGet,
    cacheSet,
  });
}

export function rawgGameUrl(slug: string) {
  return `https://rawg.io/games/${slug}`;
}
