import test from "node:test";
import assert from "node:assert/strict";
import {
  loadUpcomingWithCache,
  shortHash,
  UPCOMING_CACHE_PREFIX,
  UPCOMING_CACHE_TTL_MS,
  upcomingCacheKeyFromContext,
  upcomingCacheKeyFromHashes,
} from "../lib/aggregate-cache.ts";
import type { UpcomingCacheContext } from "../lib/aggregate-cache.ts";

const steamId = "76561198000000000";
const today = "2026-11-03";

interface Fixture {
  source: string;
  warnings: string[];
}

function fixtureFor(source: string, warnings: string[] = []): Fixture {
  return { source, warnings };
}

function contextFor(overrides: Partial<UpcomingCacheContext> = {}): UpcomingCacheContext {
  return { steamId, today, ...overrides };
}

function createCacheFixture() {
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

test("aggregate cache key uses stable short hashes and today", () => {
  const apiKeyHash = shortHash("api-key");
  const rawgKeyHash = shortHash("rawg-key");
  const key = upcomingCacheKeyFromHashes(steamId, apiKeyHash, rawgKeyHash, today);

  assert.equal(shortHash("api-key"), apiKeyHash);
  assert.equal(shortHash(undefined), "none");
  assert.ok(key.startsWith(UPCOMING_CACHE_PREFIX));
  assert.equal(
    key,
    `upcoming:v5:${steamId}:${apiKeyHash}:${rawgKeyHash}:${today}`
  );
});

test("aggregate cache context keys normalize saved, null and undefined settings keys", () => {
  assert.equal(
    upcomingCacheKeyFromContext(contextFor()),
    upcomingCacheKeyFromHashes(steamId, "none", "none", today)
  );
  assert.equal(
    upcomingCacheKeyFromContext(contextFor({ apiKey: null })),
    upcomingCacheKeyFromHashes(steamId, "none", "none", today)
  );
  assert.equal(
    upcomingCacheKeyFromContext(contextFor({ apiKey: "steam-key" })),
    upcomingCacheKeyFromHashes(steamId, shortHash("steam-key"), "none", today)
  );
  assert.equal(
    upcomingCacheKeyFromContext(
      contextFor({ apiKey: "steam-key", rawgApiKey: "rawg-key" })
    ),
    upcomingCacheKeyFromHashes(
      steamId,
      shortHash("steam-key"),
      shortHash("rawg-key"),
      today
    )
  );
});

test("keyless public and private wishlist states use the same aggregate cache key", async () => {
  const cache = createCacheFixture();
  const pending = new Map<string, Promise<Fixture>>();
  let calls = 0;

  const publicResult = await loadUpcomingWithCache<Fixture>({
    context: contextFor(),
    cacheGet: cache.get,
    cacheSet: cache.set,
    pending,
    factory: async () => {
      calls += 1;
      return fixtureFor("public-wishlist");
    },
  });

  const privateResult = await loadUpcomingWithCache<Fixture>({
    context: contextFor(),
    cacheGet: cache.get,
    cacheSet: cache.set,
    pending,
    factory: async () => {
      calls += 1;
      return fixtureFor("private-wishlist", ["wishlistHidden"]);
    },
  });

  const keylessKey = upcomingCacheKeyFromContext(contextFor());

  assert.deepEqual(publicResult, fixtureFor("public-wishlist"));
  assert.deepEqual(privateResult, publicResult);
  assert.equal(calls, 1);
  assert.equal(cache.sets.length, 1);
  assert.equal(cache.sets[0].ttlMs, UPCOMING_CACHE_TTL_MS);
  assert.equal(cache.values.get(keylessKey), publicResult);
  assert.equal(
    keylessKey,
    upcomingCacheKeyFromHashes(steamId, "none", "none", today)
  );
});

test("missing and saved API keys use different aggregate cache entries", async () => {
  const cache = createCacheFixture();
  const pending = new Map<string, Promise<Fixture>>();
  let calls = 0;

  const missing = await loadUpcomingWithCache<Fixture>({
    context: contextFor(),
    cacheGet: cache.get,
    cacheSet: cache.set,
    pending,
    factory: async () => {
      calls += 1;
      return fixtureFor("missing-api", ["noApiKey"]);
    },
  });

  const saved = await loadUpcomingWithCache<Fixture>({
    context: contextFor({ apiKey: "steam-key" }),
    cacheGet: cache.get,
    cacheSet: cache.set,
    pending,
    factory: async () => {
      calls += 1;
      return fixtureFor("saved-api");
    },
  });

  const missingKey = upcomingCacheKeyFromContext(contextFor());
  const savedKey = upcomingCacheKeyFromContext(contextFor({ apiKey: "steam-key" }));

  assert.deepEqual(missing, fixtureFor("missing-api", ["noApiKey"]));
  assert.deepEqual(saved, fixtureFor("saved-api"));
  assert.notEqual(missingKey, savedKey);
  assert.equal(cache.values.get(missingKey), missing);
  assert.equal(cache.values.get(savedKey), saved);
  assert.equal(calls, 2);
});

test("saved RAWG key changes the aggregate cache entry", async () => {
  const cache = createCacheFixture();
  const pending = new Map<string, Promise<Fixture>>();
  let calls = 0;

  const steamOnly = await loadUpcomingWithCache<Fixture>({
    context: contextFor({ apiKey: "steam-key" }),
    cacheGet: cache.get,
    cacheSet: cache.set,
    pending,
    factory: async () => {
      calls += 1;
      return fixtureFor("steam-key-only");
    },
  });

  const steamAndRawg = await loadUpcomingWithCache<Fixture>({
    context: contextFor({ apiKey: "steam-key", rawgApiKey: "rawg-key" }),
    cacheGet: cache.get,
    cacheSet: cache.set,
    pending,
    factory: async () => {
      calls += 1;
      return fixtureFor("steam-key-and-rawg-key");
    },
  });

  const steamOnlyKey = upcomingCacheKeyFromContext(contextFor({ apiKey: "steam-key" }));
  const steamAndRawgKey = upcomingCacheKeyFromContext(
    contextFor({ apiKey: "steam-key", rawgApiKey: "rawg-key" })
  );

  assert.deepEqual(steamOnly, fixtureFor("steam-key-only"));
  assert.deepEqual(steamAndRawg, fixtureFor("steam-key-and-rawg-key"));
  assert.notEqual(steamOnlyKey, steamAndRawgKey);
  assert.equal(cache.values.get(steamOnlyKey), steamOnly);
  assert.equal(cache.values.get(steamAndRawgKey), steamAndRawg);
  assert.equal(calls, 2);
});

test("saving and deleting settings keys returns aggregate cache to matching cached key states", async () => {
  const cache = createCacheFixture();
  const pending = new Map<string, Promise<Fixture>>();
  let calls = 0;
  let context = contextFor();

  async function load(source: string): Promise<Fixture> {
    return loadUpcomingWithCache<Fixture>({
      context,
      cacheGet: cache.get,
      cacheSet: cache.set,
      pending,
      factory: async () => {
        calls += 1;
        return fixtureFor(source);
      },
    });
  }

  const keyless = await load("missing-api");

  context = { ...context, apiKey: "steam-key" };
  const savedSteam = await load("saved-steam-key");

  context = { ...context, rawgApiKey: "rawg-key" };
  const savedBoth = await load("saved-steam-key-and-rawg-key");

  context = { ...context, apiKey: null };
  const rawgOnly = await load("saved-rawg-key-only");

  context = { ...context, rawgApiKey: null };
  const backToKeyless = await load("should-not-run");

  assert.deepEqual(keyless, fixtureFor("missing-api"));
  assert.deepEqual(backToKeyless, keyless);
  assert.deepEqual(savedSteam, fixtureFor("saved-steam-key"));
  assert.deepEqual(savedBoth, fixtureFor("saved-steam-key-and-rawg-key"));
  assert.deepEqual(rawgOnly, fixtureFor("saved-rawg-key-only"));
  assert.equal(calls, 4);
  assert.equal(cache.sets.length, 4);
  assert.equal(
    cache.values.get(upcomingCacheKeyFromContext(contextFor({ rawgApiKey: "rawg-key" }))),
    rawgOnly
  );
});

test("month and view changes reuse aggregate cache because they are render-only params", async () => {
  const cache = createCacheFixture();
  const pending = new Map<string, Promise<Fixture>>();
  let calls = 0;
  const context = contextFor({ apiKey: "steam-key" });
  const key = upcomingCacheKeyFromContext(context);

  assert.ok(!key.includes("2026-12"));
  assert.ok(!key.includes("grid"));
  assert.ok(!key.includes("list"));

  const first = await loadUpcomingWithCache<Fixture>({
    context,
    cacheGet: cache.get,
    cacheSet: cache.set,
    pending,
    factory: async () => {
      calls += 1;
      return fixtureFor("render-cache");
    },
  });

  for (const month of ["2026-11", "2026-12"]) {
    for (const view of ["grid", "list"]) {
      const renderOnly = await loadUpcomingWithCache<Fixture>({
        context,
        cacheGet: cache.get,
        cacheSet: cache.set,
        pending,
        factory: async () => {
          calls += 1;
          return fixtureFor(`${month}-${view}`);
        },
      });

      assert.deepEqual(renderOnly, first);
    }
  }

  assert.equal(calls, 1);

  const concurrentCache = createCacheFixture();
  const concurrentPending = new Map<string, Promise<Fixture>>();
  let concurrentCalls = 0;
  const concurrentResults = await Promise.all(
    ["grid", "list"].map((view) =>
      loadUpcomingWithCache<Fixture>({
        context,
        cacheGet: concurrentCache.get,
        cacheSet: concurrentCache.set,
        pending: concurrentPending,
        factory: async () => {
          concurrentCalls += 1;
          return fixtureFor(`concurrent-${view}`);
        },
      })
    )
  );

  assert.deepEqual(concurrentResults[0], concurrentResults[1]);
  assert.equal(concurrentCalls, 1);
  assert.equal(concurrentPending.size, 0);
});

test("logout and login reuse aggregate cache only by steamId and current settings keys", async () => {
  const cache = createCacheFixture();
  const pending = new Map<string, Promise<Fixture>>();
  let calls = 0;

  const beforeLogout = await loadUpcomingWithCache<Fixture>({
    context: contextFor(),
    cacheGet: cache.get,
    cacheSet: cache.set,
    pending,
    factory: async () => {
      calls += 1;
      return fixtureFor("logged-in-before-logout");
    },
  });

  const afterLogout = await loadUpcomingWithCache<Fixture>({
    context: contextFor(),
    cacheGet: cache.get,
    cacheSet: cache.set,
    pending,
    factory: async () => {
      calls += 1;
      return fixtureFor("should-not-run-after-logout");
    },
  });

  const otherUser = await loadUpcomingWithCache<Fixture>({
    context: contextFor({ steamId: "76561198111111111" }),
    cacheGet: cache.get,
    cacheSet: cache.set,
    pending,
    factory: async () => {
      calls += 1;
      return fixtureFor("other-user");
    },
  });

  assert.deepEqual(afterLogout, beforeLogout);
  assert.notEqual(otherUser.source, beforeLogout.source);
  assert.equal(calls, 2);
});
