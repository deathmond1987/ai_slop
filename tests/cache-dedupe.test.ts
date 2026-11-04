import test from "node:test";
import assert from "node:assert/strict";
import { loadWithCacheAndDedupe } from "../lib/cached-dedupe.ts";
import {
  APP_DETAILS_NEGATIVE_TTL_MS,
  APP_DETAILS_TTL_MS,
  APP_DETAILS_VOLATILE_TTL_MS,
  appDetailsCacheKey,
  appDetailsCacheTtl,
  ownedCacheKey,
} from "../lib/steam-core.ts";
import {
  RAWG_NEGATIVE_TTL_MS,
  RAWG_POSITIVE_TTL_MS,
  rawgCacheKey,
  rawgCacheTtl,
} from "../lib/rawg-core.ts";
import type { RawgHit } from "../lib/types.ts";

function createCacheStore() {
  const values = new Map<string, unknown>();
  const sets: { key: string; value: unknown; ttlMs: number }[] = [];

  return {
    values,
    sets,
    get: async <T>(key: string) => values.get(key) as T | undefined,
    set: async (key: string, value: unknown, ttlMs: number) => {
      values.set(key, value);
      sets.push({ key, value, ttlMs });
    },
  };
}

test("loadWithCacheAndDedupe dedupes concurrent cache misses", async () => {
  const cache = createCacheStore();
  const pending = new Map<string, Promise<string>>();
  let calls = 0;

  const first = loadWithCacheAndDedupe({
    cacheKey: "game:1",
    pending,
    cacheGet: cache.get,
    cacheSet: cache.set,
    factory: async () => {
      calls += 1;
      await Promise.resolve();
      return "game";
    },
    ttlMs: 1000,
  });

  const second = loadWithCacheAndDedupe({
    cacheKey: "game:1",
    pending,
    cacheGet: cache.get,
    cacheSet: cache.set,
    factory: async () => {
      calls += 1;
      return "game";
    },
    ttlMs: 1000,
  });

  assert.deepEqual(await Promise.all([first, second]), ["game", "game"]);
  assert.equal(calls, 1);
  assert.equal(cache.values.get("game:1"), "game");
  assert.equal(cache.sets.length, 1);
  assert.equal(cache.sets[0].ttlMs, 1000);
  assert.equal(pending.size, 0);
});

test("loadWithCacheAndDedupe caches negative values and avoids repeat factory calls", async () => {
  const cache = createCacheStore();
  const pending = new Map<string, Promise<RawgHit | null>>();
  let calls = 0;

  const options = () => ({
    cacheKey: "rawg:negative",
    pending,
    cacheGet: cache.get,
    cacheSet: cache.set,
    factory: async (): Promise<RawgHit | null> => {
      calls += 1;
      return null;
    },
    ttlMs: rawgCacheTtl,
  });

  assert.equal(await loadWithCacheAndDedupe(options()), null);
  assert.equal(await loadWithCacheAndDedupe(options()), null);
  assert.equal(calls, 1);
  assert.equal(cache.values.get("rawg:negative"), null);
  assert.equal(cache.sets[0].ttlMs, RAWG_NEGATIVE_TTL_MS);
});

test("loadWithCacheAndDedupe clears pending entries after factory rejection", async () => {
  const cache = createCacheStore();
  const pending = new Map<string, Promise<string>>();
  let calls = 0;

  await assert.rejects(
    loadWithCacheAndDedupe({
      cacheKey: "game:error",
      pending,
      cacheGet: cache.get,
      cacheSet: cache.set,
      factory: async () => {
        calls += 1;
        throw new Error("network");
      },
      ttlMs: 1000,
    }),
    /network/
  );

  assert.equal(calls, 1);
  assert.equal(pending.size, 0);
  assert.equal(cache.sets.length, 0);
});

test("Steam appdetails cache TTLs distinguish negative, volatile and stable values", () => {
  assert.equal(appDetailsCacheTtl(null), APP_DETAILS_NEGATIVE_TTL_MS);
  assert.equal(
    appDetailsCacheTtl({ release_date: { date: "2027", coming_soon: false } }),
    APP_DETAILS_VOLATILE_TTL_MS
  );
  assert.equal(
    appDetailsCacheTtl({ release_date: { date: "2027-12-31", coming_soon: false } }),
    APP_DETAILS_VOLATILE_TTL_MS
  );
  assert.equal(
    appDetailsCacheTtl({ release_date: { date: "November 4, 2027", coming_soon: true } }),
    APP_DETAILS_VOLATILE_TTL_MS
  );
  assert.equal(
    appDetailsCacheTtl({ release_date: { date: "2026-11-04", coming_soon: false } }),
    APP_DETAILS_TTL_MS
  );
});

test("Steam cache keys use stable hashed key segments", () => {
  assert.equal(ownedCacheKey("76561198000000000", "steam-key", "hash123"), "owned:76561198000000000:hash123");
  assert.equal(appDetailsCacheKey(123), "appdetails:123");
});

test("RAWG cache keys and TTLs are stable and negative-aware", () => {
  assert.equal(rawgCacheKey("  Counter-Strike ", "rawg-key", "abc"), "rawg:abc:counter-strike");
  assert.equal(rawgCacheTtl(null), RAWG_NEGATIVE_TTL_MS);
  assert.equal(
    rawgCacheTtl({ name: "Counter-Strike", released: "1998-01-01", platforms: ["PC"], slug: "counter-strike" }),
    RAWG_POSITIVE_TTL_MS
  );
});
