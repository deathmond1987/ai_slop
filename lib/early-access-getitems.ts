import "server-only";
import { logDebug, sanitizeDebugError } from "./debug";
import { cacheGetMany, cacheSetMany } from "./cache-store";
import {
  buildGetItemsUrl,
  chunkAppids,
  parseGetItemsEarlyAccess,
  type GetItemsEarlyAccessItem,
} from "./early-access-getitems-core.ts";
import { earlyAccessTimeoutMs } from "./early-access-core.ts";

const GET_ITEMS_CACHE_PREFIX = "earlyaccess:getitems:v3:";
const GET_ITEMS_TTL_MS = 24 * 60 * 60 * 1000;
const GET_ITEMS_UNKNOWN_TTL_MS = 10 * 60 * 1000;

function cacheKey(storeCc: string, appid: number): string {
  return `${GET_ITEMS_CACHE_PREFIX}${storeCc}:${appid}`;
}

async function fetchBatch(appids: number[], storeCc: string): Promise<GetItemsEarlyAccessItem[]> {
  const res = await fetch(buildGetItemsUrl(appids, storeCc), {
    cache: "no-store",
    signal: AbortSignal.timeout(earlyAccessTimeoutMs()),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Steam GetItems ${res.status}`);
  return parseGetItemsEarlyAccess(await res.json(), appids);
}

/**
 * Resolves Early Access status for many appids via IStoreBrowseService/GetItems
 * (api.steampowered.com, no key, 250 per request). Results are cached per appid.
 * Throws only when nothing could be fetched at all, so callers can fall back.
 */
export async function getEarlyAccessStatusBatch(
  appids: readonly number[],
  storeCc: string
): Promise<Map<number, GetItemsEarlyAccessItem>> {
  const out = new Map<number, GetItemsEarlyAccessItem>();
  const missing: number[] = [];
  const unique = [...new Set(appids)];
  const cached = await cacheGetMany(unique.map((appid) => cacheKey(storeCc, appid)));

  for (const appid of unique) {
    const hit = cached.get(cacheKey(storeCc, appid)) as GetItemsEarlyAccessItem | undefined;
    if (hit) out.set(appid, hit);
    else missing.push(appid);
  }

  const batches = chunkAppids(missing);
  const startedAt = Date.now();
  let failedBatches = 0;
  let lastError: unknown;

  for (const batch of batches) {
    try {
      const items = await fetchBatch(batch, storeCc);
      for (const item of items) out.set(item.appid, item);
      await cacheSetMany(
        items.map((item) => ({
          key: cacheKey(storeCc, item.appid),
          value: item,
          ttlMs: item.earlyAccess === null ? GET_ITEMS_UNKNOWN_TTL_MS : GET_ITEMS_TTL_MS,
        }))
      );
    } catch (error) {
      failedBatches += 1;
      lastError = error;
      logDebug("earlyAccess.getItems.batchFailed", {
        size: batch.length,
        error: sanitizeDebugError(error),
      });
    }
  }

  logDebug("earlyAccess.getItems.done", {
    storeCc,
    cachedHits: appids.length - missing.length,
    fetched: missing.length,
    batches: batches.length,
    failedBatches,
    earlyAccess: [...out.values()].filter((item) => item.earlyAccess === true).length,
    ms: Date.now() - startedAt,
  });

  if (batches.length > 0 && failedBatches === batches.length && out.size === 0) {
    throw lastError instanceof Error ? lastError : new Error("Steam GetItems failed");
  }
  return out;
}
