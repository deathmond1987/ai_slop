import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import { resetSteamStoreRateLimitState } from "../lib/steam-rate-limit.ts";

register(new URL("./ts-extension-resolver.mjs", import.meta.url).href, import.meta.url);

const tempDir = mkdtempSync(
  path.join(os.tmpdir(), "steam-calendar-early-access-experimental-flow-")
);
const originalFetch = globalThis.fetch;
const originalEnv = {
  DB_SQLITE_PATH: process.env.DB_SQLITE_PATH,
  DB_ENCRYPTION_KEY: process.env.DB_ENCRYPTION_KEY,
  EARLY_ACCESS_STORE_CC: process.env.EARLY_ACCESS_STORE_CC,
  EARLY_ACCESS_LOOKUP_VALIDATE_MAX: process.env.EARLY_ACCESS_LOOKUP_VALIDATE_MAX,
  STEAM_APPDETAILS_MIN_INTERVAL_MS: process.env.STEAM_APPDETAILS_MIN_INTERVAL_MS,
  STEAM_APPDETAILS_RETRY: process.env.STEAM_APPDETAILS_RETRY,
  STEAM_STORE_RATE_LIMIT_MAX_REQUESTS: process.env.STEAM_STORE_RATE_LIMIT_MAX_REQUESTS,
  EARLY_ACCESS_DETAILS_MAX: process.env.EARLY_ACCESS_DETAILS_MAX,
  EARLY_ACCESS_GETITEMS: process.env.EARLY_ACCESS_GETITEMS,
};

process.env.DB_SQLITE_PATH = path.join(tempDir, "ea-experimental-flow.sqlite");
process.env.DB_ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
delete process.env.EARLY_ACCESS_STORE_CC;
process.env.STEAM_APPDETAILS_MIN_INTERVAL_MS = "0";
process.env.STEAM_APPDETAILS_RETRY = "0";
process.env.STEAM_STORE_RATE_LIMIT_MAX_REQUESTS = "0";
process.env.EARLY_ACCESS_DETAILS_MAX = "200";
// These tests cover the legacy search/genre path.
process.env.EARLY_ACCESS_GETITEMS = "0";
resetSteamStoreRateLimitState();

interface AppDetailsFixture {
  name: string;
  genres: { description: string }[];
}

interface OwnedGameFixture {
  appid: number;
  name: string;
  playtime_forever: number;
  time_created?: number;
}

interface StoreSearchResponseFixture {
  status: number;
  body?: unknown;
}

let appDetailsByAppid = new Map<number, AppDetailsFixture>();
let ownedGamesBySteamId = new Map<string, OwnedGameFixture[]>();
let storeSearchCalls = 0;
let storeSearchResponses: StoreSearchResponseFixture[] = [];

globalThis.fetch = async (input: RequestInfo | URL) => {
  const url = new URL(String(input));

  if (
    url.hostname.includes("api.steampowered.com") &&
    url.pathname.startsWith("/IPlayerService/GetOwnedGames")
  ) {
    const steamId = url.searchParams.get("steamid") || "";
    return Response.json({
      response: {
        games: ownedGamesBySteamId.get(steamId) ?? [],
      },
    });
  }

  if (url.hostname.includes("store.steampowered.com") && url.pathname === "/api/appdetails") {
    const requested = (url.searchParams.get("appids") || "").split(",").map(Number);
    const payload: Record<number, { success: boolean; data?: AppDetailsFixture }> = {};

    for (const appid of requested) {
      const data = appDetailsByAppid.get(appid);
      payload[appid] = data ? { success: true, data } : { success: false };
    }

    return Response.json(payload);
  }

  if (url.hostname.includes("store.steampowered.com") && url.pathname.startsWith("/search/results")) {
    const fixture = storeSearchResponses[storeSearchCalls] ?? null;
    storeSearchCalls += 1;

    if (fixture?.status === 200) {
      return Response.json(fixture.body ?? {});
    }

    if (fixture) {
      return new Response(`status ${fixture.status}`, { status: fixture.status });
    }

    return new Response("not mocked", { status: 404 });
  }

  return new Response("not mocked", { status: 404 });
};

after(() => {
  globalThis.fetch = originalFetch;
  rmSync(tempDir, { recursive: true, force: true });
  resetSteamStoreRateLimitState();

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const authStore = await import("../lib/auth-store.ts");
const { prepare, runStatement } = await import("../lib/sqlite.ts");
const { ensureEarlyAccessCatalog, getEarlyAccessSessionResult, lookupEarlyAccessAppIds } = await import("../lib/early-access.ts");
const { getAppDetails } = await import("../lib/steam.ts");
const {
  EARLY_ACCESS_EXPERIMENTAL_LIST_SQL,
  EARLY_ACCESS_EXPERIMENTAL_UPSERT_SQL,
  EARLY_ACCESS_LIST_SQL,
  EARLY_ACCESS_UPSERT_SQL,
} = await import("../lib/early-access-core.ts");

async function seedIndexAppids(appids: number[], storeCc: string): Promise<void> {
  for (const appid of appids) {
    await runStatement(EARLY_ACCESS_UPSERT_SQL, appid, storeCc, Date.now());
  }
}

async function withEarlyAccessLookupValidateMax<T>(validateMax: string, fn: () => Promise<T>): Promise<T> {
  const key = "EARLY_ACCESS_LOOKUP_VALIDATE_MAX";
  const previous = process.env[key];

  try {
    process.env[key] = validateMax;
    return await fn();
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

async function experimentalAppids(steamId: string, storeCc: string): Promise<number[]> {
  const statement = await prepare(EARLY_ACCESS_EXPERIMENTAL_LIST_SQL);
  if (!statement) return [];

  return (statement.all(steamId, storeCc) as { appid?: unknown }[])
    .map((row) => Number(row.appid))
    .filter((appid) => Number.isSafeInteger(appid) && appid > 0)
    .sort((a, b) => a - b);
}

async function globalEarlyAccessAppids(storeCc: string): Promise<number[]> {
  const statement = await prepare(EARLY_ACCESS_LIST_SQL);
  if (!statement) return [];

  return (statement.all(storeCc) as { appid?: unknown }[])
    .map((row) => Number(row.appid))
    .filter((appid) => Number.isSafeInteger(appid) && appid > 0)
    .sort((a, b) => a - b);
}

test("DB-backed partial Early Access catalog avoids store-search refresh fetches", async () => {
  storeSearchCalls = 0;
  const storeCc = "de";
  const knownEa = 180000001;
  const missingAppid = 180000002;

  appDetailsByAppid = new Map([
    [knownEa, { name: "Known EA", genres: [{ description: "Early Access" }] }],
  ]);

  await seedIndexAppids([knownEa], storeCc);

  const result = await lookupEarlyAccessAppIds(`${missingAppid}`, {
    storeCc,
    refresh: true,
  });

  assert.equal(result.ready, true);
  assert.equal(result.partial, true);
  assert.equal(result.indexedCount, 1);
  assert.deepEqual(result.earlyAccessAppids, []);
  assert.ok(result.warnings.includes("early_access_index_partial"));
  assert.ok(!result.warnings.includes("early_access_fetch_failed"));
  assert.equal(storeSearchCalls, 0);
});

test("ensureEarlyAccessCatalog persists partial progress when Steam rate-limits after a successful page", async () => {
  storeSearchCalls = 0;
  storeSearchResponses = [
    {
      status: 200,
      body: {
        items: [{ appid: 190000001 }],
        total_count: 200,
      },
    },
    { status: 429 },
  ];

  const key = "EARLY_ACCESS_SEARCH_DELAY_MS";
  const previous = process.env[key];
  process.env[key] = "0";

  try {
    const status = await ensureEarlyAccessCatalog("pt", {
      refresh: true,
      full: true,
      pages: 2,
    });

    assert.equal(status.indexedCount, 1);
    assert.equal(status.pagesFetched, 1);
    assert.equal(status.totalKnown, 200);
    assert.equal(status.complete, false);
    assert.equal(status.partial, true);
    assert.ok(status.warnings.includes("early_access_index_partial"));
    assert.ok(status.warnings.includes("early_access_fetch_failed"));
  } finally {
    storeSearchResponses = [];
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test("experimental early access lookup removes stale rows and stores genre-bypass appids", async () => {
  const storeCc = "us";
  const steamId = "10000000000001001";
  const knownEa = 110000001;
  const staleExperimental = 110000002;
  const genreBypass = 110000003;

  await authStore.createDbSession({ steamId });

  appDetailsByAppid = new Map([
    [knownEa, { name: "Known EA", genres: [{ description: "Early Access" }] }],
    [staleExperimental, { name: "Not EA", genres: [{ description: "Action" }] }],
    [genreBypass, { name: "Bypass EA", genres: [{ description: "Early Access" }] }],
  ]);

  await seedIndexAppids([knownEa], storeCc);
  await runStatement(EARLY_ACCESS_EXPERIMENTAL_UPSERT_SQL, steamId, storeCc, staleExperimental, Date.now());

  const result = await lookupEarlyAccessAppIds(
    `${knownEa},${staleExperimental},${genreBypass}`,
    {
      storeCc,
      steamId,
      experimentalEarlyAccess: true,
    }
  );

  assert.equal(result.ready, true);
  assert.deepEqual(result.earlyAccessAppids, [knownEa, genreBypass]);
  assert.ok(result.warnings.includes("early_access_experimental_stale_filtered"));
  assert.ok(result.warnings.includes("early_access_genre_validated"));
  assert.ok(result.warnings.includes("early_access_experimental_validated"));
  assert.deepEqual(await experimentalAppids(steamId, storeCc), [genreBypass]);
});

test("disabled experimental early access lookup ignores experimental rows without deleting them", async () => {
  const storeCc = "us";
  const steamId = "10000000000001002";
  const knownEa = 120000001;
  const ignoredExperimental = 120000002;
  const genreBypass = 120000003;

  await authStore.createDbSession({ steamId });

  appDetailsByAppid = new Map([
    [knownEa, { name: "Known EA", genres: [{ description: "Early Access" }] }],
    [ignoredExperimental, { name: "Old Experimental EA", genres: [{ description: "Early Access" }] }],
    [genreBypass, { name: "Genre EA", genres: [{ description: "Early Access" }] }],
  ]);

  await seedIndexAppids([knownEa], storeCc);
  await runStatement(EARLY_ACCESS_EXPERIMENTAL_UPSERT_SQL, steamId, storeCc, ignoredExperimental, Date.now());

  const result = await lookupEarlyAccessAppIds(
    `${knownEa},${ignoredExperimental},${genreBypass}`,
    {
      storeCc,
      steamId,
      experimentalEarlyAccess: false,
    }
  );

  assert.equal(result.ready, true);
  assert.deepEqual(result.earlyAccessAppids, [knownEa]);
  assert.ok(!result.warnings.includes("early_access_genre_validated"));
  assert.ok(!result.warnings.includes("early_access_experimental_stale_filtered"));
  assert.deepEqual(await experimentalAppids(steamId, storeCc), [ignoredExperimental]);
});

test("experimental early access session result removes stale experimental games and validates owned genre-bypass games", async () => {
  const storeCc = "us";
  const steamId = "10000000000001003";
  const apiKey = "experimental-session-enabled-key";
  const knownEa = 130000001;
  const staleExperimental = 130000002;
  const genreBypass = 130000003;

  await authStore.createDbSession({ steamId });

  appDetailsByAppid = new Map([
    [knownEa, { name: "Known EA", genres: [{ description: "Early Access" }] }],
    [staleExperimental, { name: "Not EA", genres: [{ description: "Action" }] }],
    [genreBypass, { name: "Bypass EA", genres: [{ description: "Early Access" }] }],
  ]);
  ownedGamesBySteamId = new Map([
    [
      steamId,
      [
        { appid: knownEa, name: "Known EA", playtime_forever: 10 },
        { appid: staleExperimental, name: "Not EA", playtime_forever: 30 },
        { appid: genreBypass, name: "Bypass EA", playtime_forever: 20 },
      ],
    ],
  ]);

  await seedIndexAppids([knownEa], storeCc);
  await runStatement(EARLY_ACCESS_EXPERIMENTAL_UPSERT_SQL, steamId, storeCc, staleExperimental, Date.now());

  const result = await getEarlyAccessSessionResult(
    {
      steamId,
      apiKey,
      storeCc,
      experimentalEarlyAccess: true,
    },
    { refresh: true }
  );

  assert.equal(result.ready, true);
  assert.deepEqual(
    result.games.map((game) => game.appid).sort((a, b) => a - b),
    [knownEa, genreBypass]
  );
  assert.ok(result.warnings.includes("early_access_experimental_stale_filtered"));
  assert.ok(result.warnings.includes("early_access_experimental_validated"));
  assert.deepEqual(await experimentalAppids(steamId, storeCc), [genreBypass]);
});

test("disabled experimental early access session result ignores experimental games without deleting them", async () => {
  const storeCc = "us";
  const steamId = "10000000000001004";
  const apiKey = "experimental-session-disabled-key";
  const knownEa = 140000001;
  const ignoredExperimental = 140000002;
  const genreBypass = 140000003;

  await authStore.createDbSession({ steamId });

  appDetailsByAppid = new Map([
    [knownEa, { name: "Known EA", genres: [{ description: "Early Access" }] }],
    [ignoredExperimental, { name: "Old Experimental EA", genres: [{ description: "Early Access" }] }],
    [genreBypass, { name: "Genre EA", genres: [{ description: "Early Access" }] }],
  ]);
  ownedGamesBySteamId = new Map([
    [
      steamId,
      [
        { appid: knownEa, name: "Known EA", playtime_forever: 10 },
        { appid: ignoredExperimental, name: "Old Experimental EA", playtime_forever: 30 },
        { appid: genreBypass, name: "Genre EA", playtime_forever: 20 },
      ],
    ],
  ]);

  await seedIndexAppids([knownEa], storeCc);
  await runStatement(EARLY_ACCESS_EXPERIMENTAL_UPSERT_SQL, steamId, storeCc, ignoredExperimental, Date.now());

  const result = await getEarlyAccessSessionResult(
    {
      steamId,
      apiKey,
      storeCc,
      experimentalEarlyAccess: false,
    },
    { refresh: true }
  );

  assert.equal(result.ready, true);
  assert.deepEqual(result.games.map((game) => game.appid), [knownEa]);
  assert.ok(!result.warnings.includes("early_access_experimental_stale_filtered"));
  assert.ok(!result.warnings.includes("early_access_experimental_validated"));
  assert.deepEqual(await experimentalAppids(steamId, storeCc), [ignoredExperimental]);
});

test("experimental early access lookup prioritizes cached confirmed genre appdetails beyond the missing slice", async () => {
  const storeCc = "us";
  const steamId = "10000000000001005";
  const knownEa = 150000001;
  const notEa1 = 150000002;
  const notEa2 = 150000003;
  const notEa3 = 150000004;
  const notEa4 = 150000005;
  const notEa5 = 150000006;
  const cachedEa = 150000007;

  await authStore.createDbSession({ steamId });

  appDetailsByAppid = new Map([
    [knownEa, { name: "Known EA", genres: [{ description: "Early Access" }] }],
    [notEa1, { name: "Not EA 1", genres: [{ description: "Action" }] }],
    [notEa2, { name: "Not EA 2", genres: [{ description: "Action" }] }],
    [notEa3, { name: "Not EA 3", genres: [{ description: "Action" }] }],
    [notEa4, { name: "Not EA 4", genres: [{ description: "Action" }] }],
    [notEa5, { name: "Not EA 5", genres: [{ description: "Action" }] }],
    [cachedEa, { name: "Cached EA", genres: [{ description: "Early Access" }] }],
  ]);

  await seedIndexAppids([knownEa], storeCc);
  await getAppDetails([cachedEa], { storeCc });

  const result = await withEarlyAccessLookupValidateMax("2", () =>
    lookupEarlyAccessAppIds(
      `${knownEa},${notEa1},${notEa2},${notEa3},${notEa4},${notEa5},${cachedEa}`,
      {
        storeCc,
        steamId,
        experimentalEarlyAccess: true,
      }
    )
  );

  assert.equal(result.ready, true);
  assert.deepEqual(result.earlyAccessAppids, [knownEa, cachedEa]);
  assert.ok(!result.warnings.includes("early_access_lookup_validation_partial"));
  assert.ok(result.warnings.includes("early_access_genre_validated"));
  assert.ok(result.warnings.includes("early_access_experimental_validated"));
  assert.deepEqual(await experimentalAppids(steamId, storeCc), [cachedEa]);
});

test("experimental early access session result prioritizes cached confirmed owned games beyond the validation budget", async () => {
  const storeCc = "us";
  const steamId = "10000000000001006";
  const apiKey = "experimental-session-cached-priority-key";
  const knownEa = 160000001;
  const notEa1 = 160000002;
  const notEa2 = 160000003;
  const notEa3 = 160000004;
  const notEa4 = 160000005;
  const notEa5 = 160000006;
  const cachedEa = 160000007;

  await authStore.createDbSession({ steamId });

  appDetailsByAppid = new Map([
    [knownEa, { name: "Known EA", genres: [{ description: "Early Access" }] }],
    [notEa1, { name: "Not EA 1", genres: [{ description: "Action" }] }],
    [notEa2, { name: "Not EA 2", genres: [{ description: "Action" }] }],
    [notEa3, { name: "Not EA 3", genres: [{ description: "Action" }] }],
    [notEa4, { name: "Not EA 4", genres: [{ description: "Action" }] }],
    [notEa5, { name: "Not EA 5", genres: [{ description: "Action" }] }],
    [cachedEa, { name: "Cached EA", genres: [{ description: "Early Access" }] }],
  ]);
  ownedGamesBySteamId = new Map([
    [
      steamId,
      [
        { appid: knownEa, name: "Known EA", playtime_forever: 10 },
        { appid: notEa1, name: "Not EA 1", playtime_forever: 20 },
        { appid: notEa2, name: "Not EA 2", playtime_forever: 30 },
        { appid: notEa3, name: "Not EA 3", playtime_forever: 40 },
        { appid: notEa4, name: "Not EA 4", playtime_forever: 50 },
        { appid: notEa5, name: "Not EA 5", playtime_forever: 60 },
        { appid: cachedEa, name: "Cached EA", playtime_forever: 70 },
      ],
    ],
  ]);

  await seedIndexAppids([knownEa], storeCc);
  await getAppDetails([cachedEa], { storeCc });

  const result = await withEarlyAccessLookupValidateMax("2", () =>
    getEarlyAccessSessionResult(
      {
        steamId,
        apiKey,
        storeCc,
        experimentalEarlyAccess: true,
      },
      { refresh: true }
    )
  );

  assert.equal(result.ready, true);
  assert.deepEqual(
    result.games.map((game) => game.appid).sort((a, b) => a - b),
    [knownEa, cachedEa]
  );
  assert.ok(!result.warnings.includes("early_access_experimental_validation_partial"));
  assert.ok(result.warnings.includes("early_access_experimental_validated"));
  assert.deepEqual(await experimentalAppids(steamId, storeCc), [cachedEa]);
});

test("disabled experimental early access lookup does not prioritize cached confirmed genre appdetails", async () => {
  const storeCc = "us";
  const steamId = "10000000000001007";
  const knownEa = 170000001;
  const notEa1 = 170000002;
  const notEa2 = 170000003;
  const notEa3 = 170000004;
  const notEa4 = 170000005;
  const notEa5 = 170000006;
  const cachedEa = 170000007;

  appDetailsByAppid = new Map([
    [knownEa, { name: "Known EA", genres: [{ description: "Early Access" }] }],
    [notEa1, { name: "Not EA 1", genres: [{ description: "Action" }] }],
    [notEa2, { name: "Not EA 2", genres: [{ description: "Action" }] }],
    [notEa3, { name: "Not EA 3", genres: [{ description: "Action" }] }],
    [notEa4, { name: "Not EA 4", genres: [{ description: "Action" }] }],
    [notEa5, { name: "Not EA 5", genres: [{ description: "Action" }] }],
    [cachedEa, { name: "Cached EA", genres: [{ description: "Early Access" }] }],
  ]);

  await seedIndexAppids([knownEa], storeCc);
  await getAppDetails([cachedEa], { storeCc });

  const result = await withEarlyAccessLookupValidateMax("2", () =>
    lookupEarlyAccessAppIds(
      `${knownEa},${notEa1},${notEa2},${notEa3},${notEa4},${notEa5},${cachedEa}`,
      {
        storeCc,
        steamId,
        experimentalEarlyAccess: false,
      }
    )
  );

  assert.equal(result.ready, true);
  assert.deepEqual(result.earlyAccessAppids, [knownEa]);
  assert.ok(!result.warnings.includes("early_access_genre_validated"));
  assert.ok(!result.warnings.includes("early_access_experimental_validated"));
  assert.deepEqual(await experimentalAppids(steamId, storeCc), []);
});

test("experimental early access lookup backfills confirmed genre-bypass appids into the global catalog", async () => {
  storeSearchCalls = 0;
  const storeCc = "gb";
  const steamId = "10000000000001008";
  const knownEa = 180000101;
  const genreBypass = 180000102;

  await authStore.createDbSession({ steamId });

  appDetailsByAppid = new Map([
    [knownEa, { name: "Known EA", genres: [{ description: "Early Access" }] }],
    [genreBypass, { name: "Bypass EA", genres: [{ description: "Early Access" }] }],
  ]);

  await seedIndexAppids([knownEa], storeCc);

  const result = await withEarlyAccessLookupValidateMax("1", () =>
    lookupEarlyAccessAppIds(`${genreBypass}`, {
      storeCc,
      steamId,
      experimentalEarlyAccess: true,
    })
  );

  assert.equal(result.ready, true);
  assert.deepEqual(result.earlyAccessAppids, [genreBypass]);
  assert.equal(result.indexedCount, 2);
  assert.equal(result.partial, true);
  assert.ok(result.warnings.includes("early_access_genre_validated"));
  assert.ok(result.warnings.includes("early_access_catalog_backfilled"));
  assert.ok(result.warnings.includes("early_access_experimental_validated"));
  assert.deepEqual(await globalEarlyAccessAppids(storeCc), [knownEa, genreBypass]);
  assert.deepEqual(await experimentalAppids(steamId, storeCc), [genreBypass]);
  assert.equal(storeSearchCalls, 0);
});

test("experimental early access session result backfills confirmed owned appids into the global catalog", async () => {
  storeSearchCalls = 0;
  const storeCc = "sb";
  const steamId = "10000000000001009";
  const apiKey = "experimental-session-global-backfill-key";
  const knownEa = 180000201;
  const ownedGenreBypass = 180000202;

  await authStore.createDbSession({ steamId });

  appDetailsByAppid = new Map([
    [knownEa, { name: "Known EA", genres: [{ description: "Early Access" }] }],
    [ownedGenreBypass, { name: "Owned Bypass EA", genres: [{ description: "Early Access" }] }],
  ]);
  ownedGamesBySteamId = new Map([
    [
      steamId,
      [
        { appid: knownEa, name: "Known EA", playtime_forever: 10 },
        { appid: ownedGenreBypass, name: "Owned Bypass EA", playtime_forever: 20 },
      ],
    ],
  ]);

  await seedIndexAppids([knownEa], storeCc);

  const result = await withEarlyAccessLookupValidateMax("2", () =>
    getEarlyAccessSessionResult(
      {
        steamId,
        apiKey,
        storeCc,
        experimentalEarlyAccess: true,
      },
      { refresh: true }
    )
  );

  assert.equal(result.ready, true);
  assert.deepEqual(
    result.games.map((game) => game.appid).sort((a, b) => a - b),
    [knownEa, ownedGenreBypass]
  );
  assert.equal(result.indexedCount, 2);
  assert.equal(result.partial, true);
  assert.ok(result.warnings.includes("early_access_catalog_backfilled"));
  assert.ok(result.warnings.includes("early_access_experimental_validated"));
  assert.deepEqual(await globalEarlyAccessAppids(storeCc), [knownEa, ownedGenreBypass]);
  assert.deepEqual(await experimentalAppids(steamId, storeCc), [ownedGenreBypass]);
  assert.equal(storeSearchCalls, 0);
});

test("experimental early access session result validates all missing owned candidates regardless of validation max", async () => {
  storeSearchCalls = 0;
  const storeCc = "rc";
  const steamId = "10000000000001010";
  const apiKey = "experimental-session-recency-key";
  const knownEa = 180000301;
  const recentCandidate = 180000302;
  const olderHigherCandidate = 180000303;

  await authStore.createDbSession({ steamId });

  appDetailsByAppid = new Map([
    [knownEa, { name: "Known EA", genres: [{ description: "Early Access" }] }],
    [recentCandidate, { name: "Recent Candidate EA", genres: [{ description: "Early Access" }] }],
    [olderHigherCandidate, { name: "Older Higher Candidate EA", genres: [{ description: "Early Access" }] }],
  ]);
  ownedGamesBySteamId = new Map([
    [
      steamId,
      [
        { appid: recentCandidate, name: "Recent Candidate EA", playtime_forever: 5, time_created: 500000 },
        {
          appid: olderHigherCandidate,
          name: "Older Higher Candidate EA",
          playtime_forever: 10,
          time_created: 400000,
        },
      ],
    ],
  ]);

  await seedIndexAppids([knownEa], storeCc);

  const result = await withEarlyAccessLookupValidateMax("1", () =>
    getEarlyAccessSessionResult(
      {
        steamId,
        apiKey,
        storeCc,
        experimentalEarlyAccess: true,
      },
      { refresh: true }
    )
  );

  assert.equal(result.ready, true);
  assert.deepEqual(
    result.games.map((game) => game.appid).sort((a, b) => a - b),
    [recentCandidate, olderHigherCandidate]
  );
  assert.ok(!result.warnings.includes("early_access_experimental_validation_partial"));
  assert.ok(result.warnings.includes("early_access_catalog_backfilled"));
  assert.ok(result.warnings.includes("early_access_experimental_validated"));
  assert.deepEqual(await globalEarlyAccessAppids(storeCc), [knownEa, recentCandidate, olderHigherCandidate]);
  assert.deepEqual(await experimentalAppids(steamId, storeCc), [recentCandidate, olderHigherCandidate]);
  assert.equal(storeSearchCalls, 0);
});
